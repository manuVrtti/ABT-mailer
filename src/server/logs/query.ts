import { EmailEventType, EmailJobStatus, EmailType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Brevo-style email log: one row per thing that happened to an email —
 * SES events (sent, delivered, opened, clicked, bounced, complained,
 * rejected) plus jobs that never reached SES (failed, skipped). Shared by the
 * Logs page and its CSV export so both apply the same filters.
 */

export const LOG_EVENTS = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "rejected",
  "failed",
  "skipped",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export const LOG_EVENT_LABEL: Record<LogEvent, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Complained",
  rejected: "Rejected",
  failed: "Failed",
  skipped: "Skipped",
};

const SES_TYPE: Partial<Record<LogEvent, EmailEventType>> = {
  sent: EmailEventType.SEND,
  delivered: EmailEventType.DELIVERY,
  opened: EmailEventType.OPEN,
  clicked: EmailEventType.CLICK,
  bounced: EmailEventType.BOUNCE,
  complained: EmailEventType.COMPLAINT,
  rejected: EmailEventType.REJECT,
};
const FROM_SES_TYPE = Object.fromEntries(
  Object.entries(SES_TYPE).map(([k, v]) => [v, k as LogEvent]),
) as Partial<Record<EmailEventType, LogEvent>>;

export const SEARCH_FIELDS = ["recipient", "subject", "kind"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const MAIL_TYPES = ["all", "transactional", "marketing"] as const;
export type MailType = (typeof MAIL_TYPES)[number];

export type LogFilters = {
  q: string;
  field: SearchField;
  event: LogEvent | "all";
  type: MailType;
  /** Inclusive start, as a YYYY-MM-DD day in IST. */
  fromDay: string;
  /** Inclusive end, as a YYYY-MM-DD day in IST. */
  toDay: string;
  /** Page cursor: only rows strictly older than this instant. */
  before?: Date;
};

export type LogRow = {
  key: string;
  at: Date;
  event: LogEvent;
  jobId: string;
  recipient: string;
  subject: string;
  /** Transactional event type, or the campaign name for marketing mail. */
  kind: string;
  emailType: EmailType;
  campaignId: string | null;
  from: string;
  /** Bounce diagnostic, clicked link, error or skip reason. */
  detail: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in IST as YYYY-MM-DD. */
export function istDay(d: Date = new Date()): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function parseLogFilters(sp: Record<string, string | undefined>, now: Date = new Date()): LogFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
    v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

  const toDay = sp.to && DAY_RE.test(sp.to) ? sp.to : istDay(now);
  const fromDay = sp.from && DAY_RE.test(sp.from) ? sp.from : istDay(new Date(now.getTime() - 6 * 86_400_000));
  const before = sp.before ? new Date(sp.before) : undefined;

  return {
    q: (sp.q ?? "").trim().slice(0, 200),
    field: pick(sp.field, SEARCH_FIELDS, "recipient"),
    event: pick(sp.event, ["all", ...LOG_EVENTS] as const, "all"),
    type: pick(sp.type, MAIL_TYPES, "all"),
    fromDay,
    toDay,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
  };
}

/** [start, end) of the filter's IST day range. */
export function dayRange(f: Pick<LogFilters, "fromDay" | "toDay">): { start: Date; end: Date } {
  const start = new Date(`${f.fromDay}T00:00:00+05:30`);
  const end = new Date(new Date(`${f.toDay}T00:00:00+05:30`).getTime() + 86_400_000);
  return { start, end };
}

function jobWhere(f: LogFilters): Prisma.EmailJobWhereInput {
  const and: Prisma.EmailJobWhereInput[] = [];
  if (f.type === "transactional") and.push({ emailType: EmailType.TRANSACTIONAL });
  if (f.type === "marketing") and.push({ emailType: EmailType.MARKETING });
  if (f.q) {
    if (f.field === "recipient") and.push({ recipientEmail: { contains: f.q.toLowerCase() } });
    if (f.field === "subject") and.push({ subject: { contains: f.q, mode: "insensitive" } });
    if (f.field === "kind") {
      and.push({
        OR: [
          { eventType: { contains: f.q, mode: "insensitive" } },
          { campaign: { name: { contains: f.q, mode: "insensitive" } } },
        ],
      });
    }
  }
  return and.length ? { AND: and } : {};
}

const JOB_SELECT = {
  id: true,
  recipientEmail: true,
  subject: true,
  eventType: true,
  emailType: true,
  campaignId: true,
  fromEmail: true,
  fromName: true,
  errorCode: true,
  errorMessage: true,
  status: true,
  updatedAt: true,
  campaign: { select: { name: true } },
} satisfies Prisma.EmailJobSelect;

type JobPick = Prisma.EmailJobGetPayload<{ select: typeof JOB_SELECT }>;

function rowFromJob(job: JobPick, at: Date, event: LogEvent, detail: string, key: string): LogRow {
  return {
    key,
    at,
    event,
    jobId: job.id,
    recipient: job.recipientEmail,
    subject: job.subject,
    kind: job.campaign?.name ?? job.eventType ?? (job.emailType === EmailType.MARKETING ? "campaign" : "—"),
    emailType: job.emailType,
    campaignId: job.campaignId,
    from: job.fromName ? `${job.fromName} <${job.fromEmail}>` : job.fromEmail,
    detail,
  };
}

/** The useful line out of an SES event payload. */
export function eventDetail(type: EmailEventType, raw: unknown): string {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  if (type === EmailEventType.BOUNCE) {
    const b = r.bounce ?? {};
    const diag = b.bouncedRecipients?.[0]?.diagnosticCode ?? "";
    return [b.bounceType, b.bounceSubType, diag].filter(Boolean).join(" · ");
  }
  if (type === EmailEventType.CLICK) return String(r.click?.link ?? "");
  if (type === EmailEventType.COMPLAINT) return String(r.complaint?.complaintFeedbackType ?? "");
  if (type === EmailEventType.REJECT) return String(r.reject?.reason ?? "");
  if (type === EmailEventType.DELIVERY) return String(r.delivery?.smtpResponse ?? "").slice(0, 120);
  return "";
}

const NOT_SENT: EmailJobStatus[] = [EmailJobStatus.FAILED, EmailJobStatus.SKIPPED];

export async function queryEmailLogs(
  f: LogFilters,
  limit: number,
): Promise<{ rows: LogRow[]; total: number; nextBefore: Date | null }> {
  const { start, end } = dayRange(f);
  const upper = f.before && f.before < end ? f.before : end;
  const job = jobWhere(f);

  const sesType = f.event === "all" ? undefined : SES_TYPE[f.event];
  const wantSes = f.event === "all" || sesType !== undefined;
  const jobStatuses = f.event === "all" ? NOT_SENT : f.event === "failed" ? [EmailJobStatus.FAILED] : f.event === "skipped" ? [EmailJobStatus.SKIPPED] : [];

  const eventWhere: Prisma.EmailEventWhereInput = {
    jobId: { not: null },
    type: sesType ?? { in: Object.values(SES_TYPE) },
    job,
  };
  const failedWhere: Prisma.EmailJobWhereInput = { ...job, status: { in: jobStatuses } };

  const [events, failedJobs, eventCount, failedCount] = await Promise.all([
    wantSes
      ? db.emailEvent.findMany({
          where: { ...eventWhere, createdAt: { gte: start, lt: upper } },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          select: { id: true, type: true, createdAt: true, raw: true, job: { select: JOB_SELECT } },
        })
      : Promise.resolve([]),
    jobStatuses.length
      ? db.emailJob.findMany({
          where: { ...failedWhere, updatedAt: { gte: start, lt: upper } },
          orderBy: { updatedAt: "desc" },
          take: limit + 1,
          select: JOB_SELECT,
        })
      : Promise.resolve([]),
    wantSes ? db.emailEvent.count({ where: { ...eventWhere, createdAt: { gte: start, lt: end } } }) : Promise.resolve(0),
    jobStatuses.length
      ? db.emailJob.count({ where: { ...failedWhere, updatedAt: { gte: start, lt: end } } })
      : Promise.resolve(0),
  ]);

  const merged: LogRow[] = [
    ...events.flatMap((e) => {
      const ev = FROM_SES_TYPE[e.type];
      return e.job && ev ? [rowFromJob(e.job, e.createdAt, ev, eventDetail(e.type, e.raw), `e_${e.id}`)] : [];
    }),
    ...failedJobs.map((j) =>
      rowFromJob(
        j,
        j.updatedAt,
        j.status === EmailJobStatus.FAILED ? "failed" : "skipped",
        [j.errorCode, j.errorMessage].filter(Boolean).join(" · "),
        `j_${j.id}`,
      ),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const hasMore = merged.length > limit;
  const rows = merged.slice(0, limit);
  return { rows, total: eventCount + failedCount, nextBefore: hasMore ? rows[rows.length - 1]!.at : null };
}
