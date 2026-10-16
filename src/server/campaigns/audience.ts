import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { compileWhere } from "@/server/segments/compile";
import { ruleTreeSchema } from "@/server/segments/schema";

/** Every list a campaign targets. Older campaigns only have `listId`. */
export function campaignListIds(c: { listId: string | null; listIds: string[] }): string[] {
  if (c.listIds.length > 0) return c.listIds;
  return c.listId ? [c.listId] : [];
}

/** Contacts on any of the lists — each contact matches once, so overlaps dedupe. */
export function listsAudienceWhere(listIds: string[]): Prisma.MarketingContactWhereInput {
  return { lists: { some: { listId: { in: listIds } } } };
}

export async function countListsAudience(listIds: string[]): Promise<number> {
  if (listIds.length === 0) return 0;
  return db.marketingContact.count({ where: listsAudienceWhere(listIds) });
}

/**
 * Who a campaign's audience is, by Klymb user type. NOT_SET counts contacts
 * with no known type (CSV imports, hand-added). Used for the pre-send warning
 * when professionals or recruiters are about to be mailed.
 */
export type AudienceTypeCounts = Record<"STUDENT" | "PROFESSIONAL" | "RECRUITER" | "UNKNOWN" | "NOT_SET", number>;

export async function audienceTypeCounts(c: {
  listId: string | null;
  listIds: string[];
  segment: { rules: Prisma.JsonValue } | null;
}): Promise<AudienceTypeCounts> {
  const counts: AudienceTypeCounts = { STUDENT: 0, PROFESSIONAL: 0, RECRUITER: 0, UNKNOWN: 0, NOT_SET: 0 };
  const listIds = campaignListIds(c);
  let where: Prisma.MarketingContactWhereInput;
  if (listIds.length > 0) where = listsAudienceWhere(listIds);
  else if (c.segment) {
    const rules = ruleTreeSchema.safeParse(c.segment.rules);
    if (!rules.success) return counts;
    where = compileWhere(rules.data);
  } else return counts;

  const rows = await db.marketingContact.groupBy({ by: ["userType"], where, _count: { _all: true } });
  for (const r of rows) {
    const key = (r.userType ?? "NOT_SET") as keyof AudienceTypeCounts;
    counts[key in counts ? key : "UNKNOWN"] += r._count._all;
  }
  return counts;
}

/** What the send panel needs about a campaign's audience: type counts and its live lists. */
export async function campaignAudienceSummary(campaignId: string) {
  const c = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { listId: true, listIds: true, segment: { select: { rules: true } } },
  });
  if (!c) return { types: null, klymbLists: [] };
  const listIds = campaignListIds(c);
  const [types, klymbLists] = await Promise.all([
    audienceTypeCounts(c),
    listIds.length > 0
      ? db.contactList.findMany({
          where: { id: { in: listIds }, kind: "KLYMB" },
          select: { id: true, name: true, syncedAt: true, syncError: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    types,
    klymbLists: klymbLists.map((l) => ({
      id: l.id,
      name: l.name,
      syncedAt: l.syncedAt?.toISOString() ?? null,
      syncError: l.syncError,
    })),
  };
}
