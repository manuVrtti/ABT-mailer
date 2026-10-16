import { ContactListKind, ContactSource, ListOverrideMode, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils";
import { klymbFilterSchema, type UserType } from "./filter";
import { fetchKlymbMatches, type KlymbPerson } from "./people";

/**
 * Refresh a KLYMB (live) contact list: re-run its filter against Klymb and make
 * the list's members exactly the result, adjusted by its INCLUDE / EXCLUDE
 * overrides.
 *
 *   * Matched people become MarketingContacts (source ABTALKS_USER) or, if the
 *     address already exists, get their Klymb fields refreshed. Blank Klymb
 *     values never erase stored ones.
 *   * Members who no longer match are removed from THIS list only; the contact
 *     itself, its other lists and its send history are untouched.
 *
 * Writes go to the mailer database only. Klymb is read through klymbRead,
 * which is read-only.
 *
 * Every step is idempotent, so two refreshes of the same list racing each
 * other converge on the same membership.
 */

export interface KlymbSyncStats {
  matched: number;
  included: number;
  excluded: number;
  members: number;
  added: number;
  removed: number;
  created: number;
  updated: number;
  byType: Record<UserType, number>;
  ms: number;
}

export type RefreshTrigger = "create" | "manual" | "filter_update" | "override" | "campaign_launch";

const CHUNK = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** "Asha Rani Verma" → first "Asha", last "Rani Verma". */
export function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0]!, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

export async function refreshKlymbList(
  listId: string,
  opts: { trigger: RefreshTrigger; userId?: string | null },
): Promise<KlymbSyncStats> {
  const started = Date.now();
  const list = await db.contactList.findUnique({
    where: { id: listId },
    select: { id: true, name: true, kind: true, klymbFilter: true, overrides: { select: { email: true, mode: true } } },
  });
  if (!list) throw new Error("List not found");
  if (list.kind !== ContactListKind.KLYMB) throw new Error(`"${list.name}" is not a Klymb list`);

  try {
    const filter = klymbFilterSchema.parse(list.klymbFilter);
    const people = await fetchKlymbMatches(filter);

    const excludedSet = new Set(list.overrides.filter((o) => o.mode === ListOverrideMode.EXCLUDE).map((o) => o.email));
    const target = new Map<string, KlymbPerson | null>();
    let excluded = 0;
    for (const p of people) {
      const email = normalizeEmail(p.email);
      if (!EMAIL_RE.test(email)) continue;
      if (excludedSet.has(email)) {
        excluded++;
        continue;
      }
      target.set(email, p);
    }
    let included = 0;
    for (const o of list.overrides) {
      if (o.mode !== ListOverrideMode.INCLUDE || excludedSet.has(o.email)) continue;
      if (!target.has(o.email)) {
        target.set(o.email, null);
        included++;
      }
    }

    const { created, updated } = await upsertContacts(target);

    const contactIds: string[] = [];
    for (const emails of chunks([...target.keys()])) {
      const rows = await db.marketingContact.findMany({ where: { email: { in: emails } }, select: { id: true } });
      contactIds.push(...rows.map((r) => r.id));
    }
    const targetIds = new Set(contactIds);
    const current = await db.contactListMember.findMany({ where: { listId }, select: { contactId: true } });
    const currentIds = new Set(current.map((m) => m.contactId));
    const toAdd = contactIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !targetIds.has(id));

    let added = 0;
    for (const ids of chunks(toAdd)) {
      const res = await db.contactListMember.createMany({
        data: ids.map((contactId) => ({ contactId, listId })),
        skipDuplicates: true,
      });
      added += res.count;
    }
    let removed = 0;
    for (const ids of chunks(toRemove)) {
      const res = await db.contactListMember.deleteMany({ where: { listId, contactId: { in: ids } } });
      removed += res.count;
    }

    const byType: Record<UserType, number> = { STUDENT: 0, PROFESSIONAL: 0, RECRUITER: 0, UNKNOWN: 0 };
    for (const p of target.values()) byType[p?.userType ?? "UNKNOWN"]++;

    const stats: KlymbSyncStats = {
      matched: people.length,
      included,
      excluded,
      members: targetIds.size,
      added,
      removed,
      created,
      updated,
      byType,
      ms: Date.now() - started,
    };
    await db.contactList.update({
      where: { id: listId },
      data: { syncedAt: new Date(), syncStats: stats as unknown as Prisma.InputJsonValue, syncError: null },
    });
    await db.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        action: "list.klymb_refresh",
        resource: `list:${listId}`,
        metadata: { trigger: opts.trigger, ...stats } as unknown as Prisma.InputJsonValue,
        result: "success",
      },
    });
    logger.info({ listId, trigger: opts.trigger, ...stats }, "klymb_list.refreshed");
    return stats;
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await db.contactList.update({ where: { id: listId }, data: { syncError: message } }).catch(() => {});
    await db.auditLog
      .create({
        data: {
          userId: opts.userId ?? null,
          action: "list.klymb_refresh",
          resource: `list:${listId}`,
          metadata: { trigger: opts.trigger, error: message },
          result: "failure",
        },
      })
      .catch(() => {});
    logger.error({ err, listId, trigger: opts.trigger }, "klymb_list.refresh_failed");
    throw err;
  }
}

/** Create missing contacts and refresh Klymb fields on existing ones. */
async function upsertContacts(target: Map<string, KlymbPerson | null>): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const emails of chunks([...target.keys()])) {
    const existing = await db.marketingContact.findMany({ where: { email: { in: emails } }, select: { email: true } });
    const existingSet = new Set(existing.map((e) => e.email));

    const fresh = emails.filter((e) => !existingSet.has(e));
    if (fresh.length > 0) {
      const res = await db.marketingContact.createMany({
        data: fresh.map((email) => {
          const p = target.get(email) ?? null;
          return {
            email,
            ...splitName(p?.name ?? null),
            college: p?.college ?? null,
            graduationYear: p?.graduationYear ?? null,
            company: p?.company ?? null,
            userType: p?.userType ?? null,
            klymbUserId: p?.userId ?? null,
            // Manual INCLUDE overrides that aren't Klymb users are hand-added.
            source: p ? ContactSource.ABTALKS_USER : ContactSource.MANUAL,
          };
        }),
        skipDuplicates: true,
      });
      created += res.count;
    }

    const klymbRows = emails.filter((e) => existingSet.has(e) && target.get(e));
    if (klymbRows.length > 0) {
      // One UPDATE per chunk, as in the CSV import: per-row updates are far too slow.
      const payload = JSON.stringify(
        klymbRows.map((email) => {
          const p = target.get(email)!;
          const { firstName, lastName } = splitName(p.name);
          return {
            email,
            first_name: firstName,
            last_name: lastName,
            college: p.college,
            graduation_year: p.graduationYear,
            company: p.company,
            user_type: p.userType,
            klymb_user_id: p.userId,
          };
        }),
      );
      await db.$executeRaw`
        UPDATE marketing_contacts AS m SET
          first_name      = COALESCE(v.first_name, m.first_name),
          last_name       = COALESCE(v.last_name, m.last_name),
          college         = COALESCE(v.college, m.college),
          graduation_year = COALESCE(v.graduation_year, m.graduation_year),
          company         = COALESCE(v.company, m.company),
          user_type       = COALESCE(v.user_type, m.user_type),
          klymb_user_id   = COALESCE(v.klymb_user_id, m.klymb_user_id),
          updated_at      = now()
        FROM jsonb_to_recordset(${payload}::jsonb)
          AS v(email text, first_name text, last_name text, college text, graduation_year int,
               company text, user_type text, klymb_user_id text)
        WHERE m.email = v.email`;
      updated += klymbRows.length;
    }
  }
  return { created, updated };
}

/**
 * Refresh every Klymb list among `listIds`. Called right before a campaign
 * fans out, so people who registered a minute ago are included. Throws if any
 * refresh fails — sending to a stale or half-refreshed list is worse than not
 * sending yet.
 */
export async function refreshKlymbListsForCampaign(listIds: string[], userId?: string | null): Promise<number> {
  if (listIds.length === 0) return 0;
  const lists = await db.contactList.findMany({
    where: { id: { in: listIds }, kind: ContactListKind.KLYMB },
    select: { id: true, name: true },
  });
  for (const l of lists) {
    try {
      await refreshKlymbList(l.id, { trigger: "campaign_launch", userId });
    } catch (err) {
      throw new Error(`Couldn't refresh the Klymb list "${l.name}": ${(err as Error).message}`);
    }
  }
  return lists.length;
}
