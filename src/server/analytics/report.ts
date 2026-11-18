import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fromEmailSql, type SenderScope } from "@/server/access/filters";
import {
  autoGrouping,
  bucketKeys,
  bucketOf,
  previousPeriod,
  resolvePeriod,
  type Grouping,
  type Period,
} from "./period";

/**
 * Analytics over a date range. Counts follow the emails SENT in the range:
 * "opened" means "of the emails sent in this period, how many were opened"
 * (whenever the open happened), so rates always compare like with like.
 */

export const MAIL_TYPES = {
  campaign: "Campaigns",
  customize: "Customize mail",
  transactional: "Transactional",
} as const;
export type MailType = keyof typeof MAIL_TYPES;
export const ALL_TYPES = Object.keys(MAIL_TYPES) as MailType[];

export interface Counts {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}
const ZERO: Counts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
const add = (a: Counts, b: Counts): Counts => ({
  sent: a.sent + b.sent,
  delivered: a.delivered + b.delivered,
  opened: a.opened + b.opened,
  clicked: a.clicked + b.clicked,
  bounced: a.bounced + b.bounced,
  complained: a.complained + b.complained,
});

export interface Filters {
  types: MailType[];
  /** A sender domain (e.g. "klymb.ai"), or null for every brand the person can see. */
  domain: string | null;
}

type DayRow = Counts & { day: string; kind: MailType; domain: string };

/** Which kind of mail a job is: campaign, Customize mail, or transactional. */
const KIND_SQL = Prisma.sql`CASE
  WHEN j.campaign_id IS NOT NULL THEN 'campaign'
  WHEN j.direct_send_id IS NOT NULL THEN 'customize'
  ELSE 'transactional' END`;

function jobFilter(scope: SenderScope, f: Filters, from: Date, to: Date): Prisma.Sql {
  return Prisma.sql`j.sent_at >= ${from} AND j.sent_at < ${to}
    AND (${KIND_SQL}) = ANY(${f.types}::text[])
    ${fromEmailSql(scope, Prisma.sql`j.from_email`)}
    ${f.domain ? Prisma.sql`AND j.from_email ILIKE ${`%@${f.domain}`}` : Prisma.empty}`;
}

/** Per IST day × type × sender domain. */
async function dailyRows(scope: SenderScope, f: Filters, from: Date, to: Date): Promise<DayRow[]> {
  const rows = await db.$queryRaw<
    {
      day: string;
      kind: MailType;
      domain: string;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complained: number;
    }[]
  >(Prisma.sql`
    WITH jobs AS (
      SELECT j.id, j.sent_at, ${KIND_SQL} AS kind, lower(split_part(j.from_email, '@', 2)) AS domain
      FROM email_jobs j
      WHERE ${jobFilter(scope, f, from, to)}
    ),
    ev AS (
      SELECT e.job_id,
        bool_or(e.type = 'DELIVERY') AS d, bool_or(e.type = 'OPEN') AS o, bool_or(e.type = 'CLICK') AS c,
        bool_or(e.type = 'BOUNCE') AS b, bool_or(e.type = 'COMPLAINT') AS x
      FROM email_events e
      JOIN jobs ON jobs.id = e.job_id
      WHERE e.type IN ('DELIVERY', 'OPEN', 'CLICK', 'BOUNCE', 'COMPLAINT')
      GROUP BY e.job_id
    )
    SELECT to_char(jobs.sent_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, jobs.kind, jobs.domain,
      count(*)::int AS sent,
      count(*) FILTER (WHERE ev.d)::int AS delivered,
      -- A click means it was opened, even if the open pixel was blocked.
      count(*) FILTER (WHERE ev.o OR ev.c)::int AS opened,
      count(*) FILTER (WHERE ev.c)::int AS clicked,
      count(*) FILTER (WHERE ev.b)::int AS bounced,
      count(*) FILTER (WHERE ev.x)::int AS complained
    FROM jobs LEFT JOIN ev ON ev.job_id = jobs.id
    GROUP BY 1, 2, 3`);
  return rows;
}

export interface SeriesPoint extends Counts {
  key: string;
}

export interface TopSource {
  kind: "campaign" | "send";
  id: string;
  name: string;
  sent: number;
  opened: number;
  clicked: number;
}

export interface AnalyticsReport {
  totals: Counts;
  previous: Counts;
  unsubscribes: number;
  previousUnsubscribes: number;
  series: SeriesPoint[];
  months: SeriesPoint[];
  byType: { type: MailType; counts: Counts }[];
  byDomain: { domain: string; counts: Counts }[];
  topSources: TopSource[];
  topLinks: { url: string; clicks: number }[];
}

function rollup(rows: DayRow[], keys: string[], by: Grouping): SeriesPoint[] {
  const map = new Map(keys.map((k) => [k, { key: k, ...ZERO }]));
  for (const r of rows) {
    const p = map.get(bucketOf(r.day, by));
    if (p) Object.assign(p, add(p, r));
  }
  return [...map.values()];
}

/** Unsubscribes recorded in the range, for the brands in view. */
async function unsubscribes(scope: SenderScope, f: Filters, from: Date, to: Date): Promise<number> {
  const brandKeys = scope.brands
    .filter((b) => !f.domain || b.domain.toLowerCase() === f.domain)
    .map((b) => b.key);
  const brandFilter = scope.all && !f.domain ? {} : { brandKey: { in: brandKeys } };
  return db.suppression.count({
    where: { reason: "UNSUBSCRIBE", createdAt: { gte: from, lt: to }, ...brandFilter },
  });
}

function dropLeadingEmpty(points: SeriesPoint[]): SeriesPoint[] {
  const first = points.findIndex((p) => p.sent > 0);
  return first <= 0 ? points : points.slice(first);
}

export async function analyticsReport(
  scope: SenderScope,
  f: Filters,
  period: Period,
  by: Grouping,
): Promise<AnalyticsReport> {
  const prev = previousPeriod(period);
  const [rows, prevRows, unsub, prevUnsub, sources, links] = await Promise.all([
    dailyRows(scope, f, period.from, period.to),
    dailyRows(scope, f, prev.from, prev.to),
    unsubscribes(scope, f, period.from, period.to),
    unsubscribes(scope, f, prev.from, prev.to),
    db.$queryRaw<
      {
        campaign_id: string | null;
        direct_send_id: string | null;
        sent: number;
        opened: number;
        clicked: number;
      }[]
    >(Prisma.sql`
      WITH jobs AS (
        SELECT j.id, j.campaign_id, j.direct_send_id FROM email_jobs j
        WHERE ${jobFilter(scope, f, period.from, period.to)} AND (j.campaign_id IS NOT NULL OR j.direct_send_id IS NOT NULL)
      ),
      ev AS (
        SELECT e.job_id, bool_or(e.type IN ('OPEN', 'CLICK')) AS o, bool_or(e.type = 'CLICK') AS c
        FROM email_events e JOIN jobs ON jobs.id = e.job_id
        WHERE e.type IN ('OPEN', 'CLICK') GROUP BY e.job_id
      )
      SELECT jobs.campaign_id, jobs.direct_send_id, count(*)::int AS sent,
        count(*) FILTER (WHERE ev.o)::int AS opened, count(*) FILTER (WHERE ev.c)::int AS clicked
      FROM jobs LEFT JOIN ev ON ev.job_id = jobs.id
      GROUP BY 1, 2 ORDER BY sent DESC LIMIT 10`),
    db.$queryRaw<{ url: string; clicks: number }[]>(Prisma.sql`
      -- Same page with different tracking tags counts as one link.
      SELECT split_part(split_part(e.raw->'click'->>'link', '#', 1), '?', 1) AS url, count(*)::int AS clicks
      FROM email_events e JOIN email_jobs j ON j.id = e.job_id
      WHERE e.type = 'CLICK' AND e.raw->'click'->>'link' IS NOT NULL
        AND e.raw->'click'->>'link' NOT ILIKE '%/unsubscribe%'
        AND ${jobFilter(scope, f, period.from, period.to)}
      GROUP BY 1 ORDER BY clicks DESC LIMIT 10`),
  ]);

  const totals = rows.reduce<Counts>((a, r) => add(a, r), ZERO);
  const previous = prevRows.reduce<Counts>((a, r) => add(a, r), ZERO);

  const byTypeMap = new Map<MailType, Counts>();
  const byDomainMap = new Map<string, Counts>();
  for (const r of rows) {
    byTypeMap.set(r.kind, add(byTypeMap.get(r.kind) ?? ZERO, r));
    byDomainMap.set(r.domain, add(byDomainMap.get(r.domain) ?? ZERO, r));
  }

  const campaignIds = sources.map((s) => s.campaign_id).filter((x): x is string => Boolean(x));
  const sendIds = sources.map((s) => s.direct_send_id).filter((x): x is string => Boolean(x));
  const [campaigns, sends] = await Promise.all([
    campaignIds.length
      ? db.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })
      : [],
    sendIds.length
      ? db.directSend.findMany({ where: { id: { in: sendIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const nameOf = new Map([...campaigns, ...sends].map((x) => [x.id, x.name]));

  return {
    totals,
    previous,
    unsubscribes: unsub,
    previousUnsubscribes: prevUnsub,
    series: rollup(rows, bucketKeys(period.fromDay, period.toDay, by), by),
    // Months before the first email (e.g. Jan–Aug of a year we started in Sept) are left out.
    months: dropLeadingEmpty(rollup(rows, bucketKeys(period.fromDay, period.toDay, "month"), "month")),
    byType: ALL_TYPES.filter((t) => f.types.includes(t)).map((t) => ({
      type: t,
      counts: byTypeMap.get(t) ?? ZERO,
    })),
    byDomain: [...byDomainMap.entries()]
      .map(([domain, counts]) => ({ domain, counts }))
      .sort((a, b) => b.counts.sent - a.counts.sent),
    topSources: sources.map((s) => ({
      kind: s.campaign_id ? ("campaign" as const) : ("send" as const),
      id: (s.campaign_id ?? s.direct_send_id)!,
      name: nameOf.get((s.campaign_id ?? s.direct_send_id)!) ?? "(deleted)",
      sent: s.sent,
      opened: s.opened,
      clicked: s.clicked,
    })),
    topLinks: links,
  };
}

export interface AnalyticsParams {
  preset?: string;
  from?: string;
  to?: string;
  by?: string;
  types?: string;
  brand?: string;
}

/** Period, grouping and filters from the URL; anything invalid falls back to a default. */
export function readAnalyticsParams(sp: AnalyticsParams, scope: SenderScope) {
  const period = resolvePeriod(sp);
  const by: Grouping =
    sp.by === "day" || sp.by === "week" || sp.by === "month" ? sp.by : autoGrouping(period.days);
  const picked = (sp.types ?? "").split(",").filter((t): t is MailType => t in MAIL_TYPES);
  const types = picked.length ? ALL_TYPES.filter((t) => picked.includes(t)) : ALL_TYPES;
  const brand = scope.brands.find((b) => b.domain.toLowerCase() === sp.brand?.toLowerCase());
  return {
    period,
    by,
    filters: { types, domain: brand ? brand.domain.toLowerCase() : null } as Filters,
    autoBy: !sp.by,
  };
}
