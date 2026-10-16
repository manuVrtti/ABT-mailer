import { EmailEventType, EmailJobStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Personal-mails analytics, from the same SES events campaigns use
 * (delivery / open / click / bounce / complaint via the SNS webhook).
 * Opens and clicks count each email once, however many times it was opened.
 */
export interface DirectSendStats {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  skipped: number;
}

export interface RowActivity {
  status: EmailJobStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  openCount: number;
  clickedAt: Date | null;
  clickCount: number;
}

const IN_FLIGHT: EmailJobStatus[] = [EmailJobStatus.PENDING, EmailJobStatus.QUEUED, EmailJobStatus.SENDING];
// Once SES accepted a job it stays "sent" even after it is delivered or bounces.
const ACCEPTED: EmailJobStatus[] = [
  EmailJobStatus.SENT,
  EmailJobStatus.DELIVERED,
  EmailJobStatus.BOUNCED,
  EmailJobStatus.COMPLAINED,
];

export async function directSendStats(directSendId: string, totalRows: number): Promise<DirectSendStats> {
  const [byStatus, events] = await Promise.all([
    db.emailJob.groupBy({ by: ["status"], where: { directSendId }, _count: { _all: true } }),
    db.$queryRaw<{ type: EmailEventType; n: number }[]>(Prisma.sql`
      SELECT e.type, count(DISTINCT e.job_id)::int AS n
      FROM email_events e JOIN email_jobs j ON j.id = e.job_id
      WHERE j.direct_send_id = ${directSendId}
      GROUP BY e.type`),
  ]);
  const st = (list: EmailJobStatus[]) =>
    byStatus.filter((s) => list.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  const ev = (t: EmailEventType) => events.find((e) => e.type === t)?.n ?? 0;
  return {
    total: totalRows,
    queued: st(IN_FLIGHT),
    sent: st(ACCEPTED),
    // A delivered job may later bounce or complain, so take whichever is larger.
    delivered: Math.max(ev(EmailEventType.DELIVERY), st([EmailJobStatus.DELIVERED, EmailJobStatus.COMPLAINED])),
    opened: ev(EmailEventType.OPEN),
    clicked: ev(EmailEventType.CLICK),
    bounced: Math.max(ev(EmailEventType.BOUNCE), st([EmailJobStatus.BOUNCED])),
    complained: Math.max(ev(EmailEventType.COMPLAINT), st([EmailJobStatus.COMPLAINED])),
    failed: st([EmailJobStatus.FAILED]),
    skipped: st([EmailJobStatus.SKIPPED]),
  };
}

/** Per-email status and engagement for the given job ids. */
export async function rowActivity(jobIds: string[]): Promise<Map<string, RowActivity>> {
  const out = new Map<string, RowActivity>();
  if (jobIds.length === 0) return out;
  const [jobs, events] = await Promise.all([
    db.emailJob.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, status: true, errorMessage: true, sentAt: true },
    }),
    db.$queryRaw<{ job_id: string; type: EmailEventType; first: Date; n: number }[]>(Prisma.sql`
      SELECT job_id, type, min(created_at) AS first, count(*)::int AS n
      FROM email_events
      WHERE job_id IN (${Prisma.join(jobIds)}) AND type IN ('DELIVERY', 'OPEN', 'CLICK')
      GROUP BY job_id, type`),
  ]);
  for (const j of jobs) {
    out.set(j.id, {
      status: j.status,
      errorMessage: j.errorMessage,
      sentAt: j.sentAt,
      deliveredAt: null,
      openedAt: null,
      openCount: 0,
      clickedAt: null,
      clickCount: 0,
    });
  }
  for (const e of events) {
    const a = out.get(e.job_id);
    if (!a) continue;
    if (e.type === "DELIVERY") a.deliveredAt = e.first;
    if (e.type === "OPEN") {
      a.openedAt = e.first;
      a.openCount = e.n;
    }
    if (e.type === "CLICK") {
      a.clickedAt = e.first;
      a.clickCount = e.n;
    }
  }
  return out;
}

/** Sent / opened / clicked per batch, for the list page. */
export async function batchSummaries(ids: string[]): Promise<Map<string, { sent: number; opened: number; clicked: number; failed: number }>> {
  const out = new Map<string, { sent: number; opened: number; clicked: number; failed: number }>();
  if (ids.length === 0) return out;
  const rows = await db.$queryRaw<{ id: string; sent: number; opened: number; clicked: number; failed: number }[]>(Prisma.sql`
    SELECT j.direct_send_id AS id,
      count(*) FILTER (WHERE j.status IN ('SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED'))::int AS sent,
      count(*) FILTER (WHERE j.status IN ('FAILED', 'BOUNCED'))::int AS failed,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events o WHERE o.job_id = j.id AND o.type = 'OPEN'))::int AS opened,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events c WHERE c.job_id = j.id AND c.type = 'CLICK'))::int AS clicked
    FROM email_jobs j
    WHERE j.direct_send_id IN (${Prisma.join(ids)})
    GROUP BY j.direct_send_id`);
  for (const r of rows) out.set(r.id, r);
  return out;
}
