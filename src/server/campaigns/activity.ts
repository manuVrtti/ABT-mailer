import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Per-recipient engagement for one campaign: who it was delivered to, who
 * opened (and how often), who clicked and which links. Built from email_jobs
 * joined with the SES events the webhook stored for each job.
 */

export const ACTIVITY_FILTERS = ["all", "opened", "clicked", "not_opened", "bounced"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export type RecipientActivity = {
  jobId: string;
  email: string;
  name: string | null;
  status: string;
  sentAt: Date | null;
  delivered: boolean;
  opens: number;
  firstOpenAt: Date | null;
  clicks: number;
  links: string[];
  lastActivityAt: Date | null;
};

type Row = {
  job_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  sent_at: Date | null;
  delivered: bigint;
  opens: bigint;
  first_open_at: Date | null;
  clicks: bigint;
  links: string[] | null;
  last_activity_at: Date | null;
};

function havingFor(filter: ActivityFilter): Prisma.Sql {
  switch (filter) {
    case "opened":
      return Prisma.sql`HAVING count(e.id) FILTER (WHERE e.type = 'OPEN') > 0`;
    case "clicked":
      return Prisma.sql`HAVING count(e.id) FILTER (WHERE e.type = 'CLICK') > 0`;
    case "not_opened":
      return Prisma.sql`HAVING count(e.id) FILTER (WHERE e.type IN ('OPEN', 'CLICK')) = 0
        AND j.status NOT IN ('BOUNCED', 'FAILED', 'SKIPPED')`;
    case "bounced":
      return Prisma.sql`HAVING j.status = 'BOUNCED' OR count(e.id) FILTER (WHERE e.type = 'BOUNCE') > 0`;
    default:
      return Prisma.empty;
  }
}

function baseQuery(campaignId: string, filter: ActivityFilter, search: string): Prisma.Sql {
  const q = search.trim();
  const searchSql = q
    ? Prisma.sql`AND (j.recipient_email ILIKE ${"%" + q + "%"}
        OR concat_ws(' ', c.first_name, c.last_name) ILIKE ${"%" + q + "%"})`
    : Prisma.empty;
  return Prisma.sql`
    SELECT
      j.id AS job_id,
      j.recipient_email AS email,
      c.first_name,
      c.last_name,
      j.status::text AS status,
      j.sent_at,
      count(e.id) FILTER (WHERE e.type = 'DELIVERY') AS delivered,
      count(e.id) FILTER (WHERE e.type = 'OPEN') AS opens,
      min(e.created_at) FILTER (WHERE e.type = 'OPEN') AS first_open_at,
      count(e.id) FILTER (WHERE e.type = 'CLICK') AS clicks,
      array_agg(DISTINCT e.raw->'click'->>'link') FILTER (WHERE e.type = 'CLICK') AS links,
      max(e.created_at) FILTER (WHERE e.type IN ('OPEN', 'CLICK')) AS last_activity_at
    FROM email_jobs j
    LEFT JOIN marketing_contacts c ON c.id = j.contact_id
    LEFT JOIN email_events e ON e.job_id = j.id
    WHERE j.campaign_id = ${campaignId} ${searchSql}
    GROUP BY j.id, c.id
    ${havingFor(filter)}`;
}

function toActivity(r: Row): RecipientActivity {
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return {
    jobId: r.job_id,
    email: r.email,
    name: name || null,
    status: r.status,
    sentAt: r.sent_at,
    delivered: Number(r.delivered) > 0 || r.status === "DELIVERED",
    opens: Number(r.opens),
    firstOpenAt: r.first_open_at,
    clicks: Number(r.clicks),
    links: (r.links ?? []).filter(Boolean).map(cleanLink),
    lastActivityAt: r.last_activity_at,
  };
}

/** Drop utm_* params we add ourselves so the clicked link reads cleanly. */
export function cleanLink(link: string): string {
  try {
    const u = new URL(link);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return link;
  }
}

export async function getRecipientActivity(
  campaignId: string,
  opts: { filter?: ActivityFilter; search?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: RecipientActivity[]; total: number }> {
  const filter = opts.filter ?? "all";
  const search = opts.search ?? "";
  const base = baseQuery(campaignId, filter, search);
  const limitSql = opts.limit != null ? Prisma.sql`LIMIT ${opts.limit} OFFSET ${opts.offset ?? 0}` : Prisma.empty;

  const [rows, totalRows] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT * FROM (${base}) t
      ORDER BY t.clicks DESC, t.opens DESC, t.last_activity_at DESC NULLS LAST, t.email ASC
      ${limitSql}`,
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM (${base}) t`,
  ]);
  return { rows: rows.map(toActivity), total: Number(totalRows[0]?.n ?? 0) };
}
