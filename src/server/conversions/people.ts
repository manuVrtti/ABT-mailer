import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { klymbProfiles, type KlymbProfile } from "@/server/klymb/profiles";
import { fromEmailWhere, type SenderScope } from "@/server/access/filters";

/**
 * Conversions → People: everyone who opened, clicked or acted in Klymb after
 * one campaign or Customize-mail send, with their Klymb details.
 */

export type PeopleSource = { kind: "campaign" | "send"; id: string };

export interface SourceOption {
  key: string; // "c:<id>" | "s:<id>"
  kind: "campaign" | "send";
  id: string;
  name: string;
  fromEmail: string;
  at: Date | null;
  single: boolean;
}

export function sourceKey(s: PeopleSource): string {
  return `${s.kind === "campaign" ? "c" : "s"}:${s.id}`;
}

export function parseSourceKey(raw: string | undefined): PeopleSource | null {
  const m = raw?.match(/^([cs]):([a-z0-9]{10,40})$/);
  return m ? { kind: m[1] === "c" ? "campaign" : "send", id: m[2]! } : null;
}

/** Campaigns and sends that went out, newest first — the source picker. */
export async function sourceOptions(scope: SenderScope): Promise<SourceOption[]> {
  const scoped = fromEmailWhere(scope);
  const [campaigns, sends] = await Promise.all([
    db.campaign.findMany({
      where: { AND: [scoped, { startedAt: { not: null } }] },
      orderBy: { startedAt: "desc" },
      take: 300,
      select: { id: true, name: true, fromEmail: true, startedAt: true },
    }),
    db.directSend.findMany({
      where: { AND: [scoped, { startedAt: { not: null } }] },
      orderBy: { startedAt: "desc" },
      take: 300,
      select: { id: true, name: true, fromEmail: true, startedAt: true, single: true },
    }),
  ]);
  return [
    ...campaigns.map((c) => ({
      key: `c:${c.id}`,
      kind: "campaign" as const,
      id: c.id,
      name: c.name,
      fromEmail: c.fromEmail,
      at: c.startedAt,
      single: false,
    })),
    ...sends.map((s) => ({
      key: `s:${s.id}`,
      kind: "send" as const,
      id: s.id,
      name: s.name,
      fromEmail: s.fromEmail,
      at: s.startedAt,
      single: s.single,
    })),
  ];
}

export interface PersonAction {
  label: string;
  at: Date;
  clicked: boolean;
}

export interface EngagedPerson {
  email: string;
  jobId: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  opens: number;
  clickedAt: Date | null;
  clicks: number;
  links: string[];
  actions: PersonAction[];
  /** From Klymb, else from our own contact record. */
  name: string | null;
  userType: string | null;
  college: string | null;
  company: string | null;
  graduationYear: number | null;
  city: string | null;
  phone: string | null;
  linkedin: string | null;
  inKlymb: boolean;
}

export interface SourcePeople {
  sent: number;
  people: EngagedPerson[];
  klymbError: string | null;
  loadedAt: Date;
}

const MAX_PEOPLE = 25_000;
const TTL_MS = 5 * 60_000;
const memo = new Map<string, { at: number; value: SourcePeople }>();

type EngagedRow = {
  job_id: string;
  email: string;
  sent_at: Date | null;
  delivered_at: Date | null;
  opened_at: Date | null;
  opens: number;
  clicked_at: Date | null;
  clicks: number;
  links: string[] | null;
};

/**
 * Everyone who engaged with the source, with details. Cached for a few
 * minutes per server instance: the Klymb lookup is the slow part, and
 * filtering / paging the list happens in memory.
 */
export async function sourcePeople(
  source: PeopleSource,
  opts: { fresh?: boolean } = {},
): Promise<SourcePeople> {
  const key = sourceKey(source);
  const hit = memo.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const col = source.kind === "campaign" ? Prisma.sql`j.campaign_id` : Prisma.sql`j.direct_send_id`;
  const [rows, sentRow, actions] = await Promise.all([
    db.$queryRaw<EngagedRow[]>(Prisma.sql`
      SELECT j.id AS job_id, lower(j.recipient_email) AS email, j.sent_at,
        min(e.created_at) FILTER (WHERE e.type = 'DELIVERY') AS delivered_at,
        min(e.created_at) FILTER (WHERE e.type = 'OPEN') AS opened_at,
        (count(*) FILTER (WHERE e.type = 'OPEN'))::int AS opens,
        min(e.created_at) FILTER (WHERE e.type = 'CLICK') AS clicked_at,
        (count(*) FILTER (WHERE e.type = 'CLICK'))::int AS clicks,
        array_agg(DISTINCT e.raw->'click'->>'link') FILTER (
          WHERE e.type = 'CLICK' AND e.raw->'click'->>'link' IS NOT NULL
            AND e.raw->'click'->>'link' NOT ILIKE '%/unsubscribe%'
        ) AS links
      FROM email_jobs j
      JOIN email_events e ON e.job_id = j.id
      WHERE ${col} = ${source.id}
      GROUP BY j.id
      HAVING count(*) FILTER (WHERE e.type IN ('OPEN', 'CLICK')) > 0
      ORDER BY max(e.created_at) DESC
      LIMIT ${MAX_PEOPLE}`),
    db.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM email_jobs j WHERE ${col} = ${source.id} AND j.sent_at IS NOT NULL`),
    db.attributedConversion.findMany({
      where: source.kind === "campaign" ? { campaignId: source.id } : { directSendId: source.id },
      orderBy: { actionAt: "asc" },
      select: { email: true, emailJobId: true, label: true, actionAt: true, clicked: true, sentAt: true },
    }),
  ]);

  const byEmail = new Map<string, EngagedPerson>();
  const blank = (email: string, jobId: string, sentAt: Date | null): EngagedPerson => ({
    email,
    jobId,
    sentAt,
    deliveredAt: null,
    openedAt: null,
    opens: 0,
    clickedAt: null,
    clicks: 0,
    links: [],
    actions: [],
    name: null,
    userType: null,
    college: null,
    company: null,
    graduationYear: null,
    city: null,
    phone: null,
    linkedin: null,
    inKlymb: false,
  });
  for (const r of rows) {
    byEmail.set(r.email, {
      ...blank(r.email, r.job_id, r.sent_at),
      deliveredAt: r.delivered_at,
      openedAt: r.opened_at,
      opens: r.opens,
      clickedAt: r.clicked_at,
      clicks: r.clicks,
      links: r.links ?? [],
    });
  }
  // People who acted in Klymb without a tracked open still belong here.
  for (const a of actions) {
    const email = a.email.toLowerCase();
    const p = byEmail.get(email) ?? blank(email, a.emailJobId, a.sentAt);
    p.actions.push({ label: a.label, at: a.actionAt, clicked: a.clicked });
    byEmail.set(email, p);
  }
  const people = [...byEmail.values()];
  const emails = people.map((p) => p.email);

  let klymbError: string | null = null;
  let profiles = new Map<string, KlymbProfile>();
  try {
    profiles = await klymbProfiles(emails);
  } catch (err) {
    klymbError = (err as Error).message;
    logger.error({ err, source: key }, "conversions.people.klymb_failed");
  }
  const contacts = await db.marketingContact.findMany({
    where: { email: { in: emails.filter((e) => !profiles.has(e)) } },
    select: { email: true, firstName: true, lastName: true, phone: true },
  });
  const contactOf = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));

  for (const p of people) {
    const k = profiles.get(p.email);
    if (k) {
      Object.assign(p, {
        name: k.name,
        userType: k.userType,
        college: k.college,
        company: k.company,
        graduationYear: k.graduationYear,
        city: k.city,
        phone: k.phone,
        linkedin: k.linkedin,
        inKlymb: Boolean(k.userId),
      });
      continue;
    }
    const c = contactOf.get(p.email);
    if (c) {
      p.name = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
      p.phone = c.phone;
    }
  }

  const value: SourcePeople = { sent: sentRow[0]?.n ?? 0, people, klymbError, loadedAt: new Date() };
  if (!klymbError) memo.set(key, { at: Date.now(), value });
  return value;
}

export const PEOPLE_FILTERS = {
  all: "Everyone",
  clicked: "Clicked",
  opened_only: "Opened, didn't click",
  acted: "Acted in Klymb",
} as const;
export type PeopleFilter = keyof typeof PEOPLE_FILTERS;

export const PEOPLE_SORTS = {
  engaged: "Most engaged",
  recent: "Most recent",
  name: "Name A–Z",
  college: "College A–Z",
} as const;
export type PeopleSort = keyof typeof PEOPLE_SORTS;

/** Filter, search and sort the list (pure, so it's easy to test). */
export function selectPeople(
  people: EngagedPerson[],
  opts: { show: PeopleFilter; q: string; sort: PeopleSort },
): EngagedPerson[] {
  const q = opts.q.trim().toLowerCase();
  const out = people.filter((p) => {
    if (opts.show === "clicked" && p.clicks === 0) return false;
    if (opts.show === "opened_only" && (p.opens === 0 || p.clicks > 0)) return false;
    if (opts.show === "acted" && p.actions.length === 0) return false;
    if (!q) return true;
    return [p.email, p.name, p.college, p.company, p.city, p.phone].some((v) => v?.toLowerCase().includes(q));
  });
  const last = (p: EngagedPerson) =>
    Math.max(
      p.openedAt?.getTime() ?? 0,
      p.clickedAt?.getTime() ?? 0,
      ...p.actions.map((a) => a.at.getTime()),
    );
  const text = (v: string | null) => (v ?? "￿").toLowerCase();
  return out.sort((a, b) => {
    switch (opts.sort) {
      case "recent":
        return last(b) - last(a);
      case "name":
        return text(a.name ?? a.email).localeCompare(text(b.name ?? b.email));
      case "college":
        return text(a.college).localeCompare(text(b.college));
      default:
        return (
          b.actions.length - a.actions.length || b.clicks - a.clicks || b.opens - a.opens || last(b) - last(a)
        );
    }
  });
}

export function peopleCounts(people: EngagedPerson[]) {
  return {
    opened: people.filter((p) => p.opens > 0 || p.clicks > 0).length,
    clicked: people.filter((p) => p.clicks > 0).length,
    acted: people.filter((p) => p.actions.length > 0).length,
    total: people.length,
  };
}
