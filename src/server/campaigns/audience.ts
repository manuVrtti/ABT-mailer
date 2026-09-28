import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
