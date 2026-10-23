import Link from "next/link";
import { DirectSendKind, DirectSendStatus, Prisma, Role } from "@prisma/client";
import { Mail, Plus, Search, Send } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Badge, Button, EmptyState, PageHeader, Table, Tabs, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";
import { batchSummaries } from "@/server/direct-send/stats";
import { currentScope, fromEmailWhere } from "@/server/access/scope";
import { currentPermissions, requireAccess } from "@/server/access/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customize mail" };

const TONE: Record<DirectSendStatus, "muted" | "info" | "success" | "warning"> = {
  DRAFT: "muted",
  SENDING: "info",
  COMPLETED: "success",
  CANCELLED: "warning",
};

const STATUSES = ["all", "DRAFT", "SENDING", "COMPLETED", "CANCELLED"] as const;
type StatusKey = (typeof STATUSES)[number];
const STATUS_LABEL: Record<StatusKey, string> = {
  all: "All",
  DRAFT: "Draft",
  SENDING: "Sending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const TYPES = { all: "All types", PERSONAL: "Personal", MARKETING: "Promotional" } as const;
type TypeKey = keyof typeof TYPES;

const PERIODS = {
  any: "Any time",
  "1": "Today",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
} as const;
type PeriodKey = keyof typeof PERIODS;

const SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
  "name-desc": "Name Z–A",
  largest: "Most emails",
  smallest: "Fewest emails",
  "open-rate": "Best open rate",
  "click-rate": "Best click rate",
  failed: "Most failed",
} as const;
type SortKey = keyof typeof SORTS;

const PAGE_SIZE = 50;
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const control =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function pick<T extends string>(
  v: string | undefined,
  allowed: readonly T[] | Record<T, unknown>,
  fallback: T,
): T {
  const keys = (Array.isArray(allowed) ? allowed : Object.keys(allowed)) as readonly string[];
  return v && keys.includes(v) ? (v as T) : fallback;
}

/** Other recipients of a single email besides the first To: more To, CC and BCC. */
function recipientsBeyondFirst(s: { toEmails: string[]; ccEmails: string[]; bccEmails: string[] }) {
  return Math.max(0, s.toEmails.length - 1) + s.ccEmails.length + s.bccEmails.length;
}

function rate(n: number, of: number) {
  return of > 0 ? n / of : -1;
}
function pct(n: number, of: number) {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "";
}

export default async function DirectSendsPage({
  searchParams,
}: {
  searchParams: {
    mode?: string;
    q?: string;
    status?: string;
    type?: string;
    from?: string;
    period?: string;
    sort?: string;
    page?: string;
  };
}) {
  await requireAccess("personal.manage");
  const user = await requireRole([Role.ADMIN, Role.MARKETER, Role.VIEWER]);
  const q = (searchParams.q ?? "").trim().slice(0, 200);
  const status = pick<StatusKey>(searchParams.status, STATUSES, "all");
  const type = pick<TypeKey>(searchParams.type, TYPES, "all");
  const period = pick<PeriodKey>(searchParams.period, PERIODS, "any");
  const sort = pick<SortKey>(searchParams.sort, SORTS, "newest");
  const from = (searchParams.from ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(searchParams.page) || 1);
  // Two sections: bulk CSV batches and single emails.
  const single = searchParams.mode === "single";

  // Everything except the status tab, so the tab counts reflect the other filters.
  // Only batches sent from this person's brands (all, for admins).
  const scopedAll = fromEmailWhere(await currentScope());
  const scoped: Prisma.DirectSendWhereInput = { AND: [scopedAll, { single }] };
  const base: Prisma.DirectSendWhereInput = {
    AND: [
      scoped,
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { fromEmail: { contains: q, mode: "insensitive" } },
              // "Did we send anything to asha@…?" — matches a recipient or a subject.
              { rows: { some: { email: { contains: q, mode: "insensitive" } } } },
              { rows: { some: { subject: { contains: q, mode: "insensitive" } } } },
              { toEmails: { has: q.toLowerCase() } },
              { ccEmails: { has: q.toLowerCase() } },
              { bccEmails: { has: q.toLowerCase() } },
            ],
          }
        : {},
      type !== "all" && !single ? { kind: type as DirectSendKind } : {},
      from ? { fromEmail: from } : {},
      period !== "any" ? { createdAt: { gte: new Date(Date.now() - Number(period) * 86_400_000) } } : {},
    ],
  };
  const where: Prisma.DirectSendWhereInput =
    status === "all" ? base : { AND: [base, { status: status as DirectSendStatus }] };

  const [all, statusCounts, senders] = await Promise.all([
    db.directSend.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        name: true,
        status: true,
        kind: true,
        totalRows: true,
        fromEmail: true,
        createdAt: true,
        toEmails: true,
        ccEmails: true,
        bccEmails: true,
        _count: { select: { attachments: true } },
      },
    }),
    db.directSend.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.directSend.findMany({
      where: scoped,
      distinct: ["fromEmail"],
      select: { fromEmail: true },
      orderBy: { fromEmail: "asc" },
    }),
  ]);
  const summaries = await batchSummaries(all.map((s) => s.id));
  const sum = (id: string) => summaries.get(id) ?? { sent: 0, opened: 0, clicked: 0, failed: 0 };

  const sorted = [...all].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      case "name":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "largest":
        return b.totalRows - a.totalRows;
      case "smallest":
        return a.totalRows - b.totalRows;
      case "open-rate":
        return rate(sum(b.id).opened, sum(b.id).sent) - rate(sum(a.id).opened, sum(a.id).sent);
      case "click-rate":
        return rate(sum(b.id).clicked, sum(b.id).sent) - rate(sum(a.id).clicked, sum(a.id).sent);
      case "failed":
        return sum(b.id).failed - sum(a.id).failed;
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const countOf = (s: StatusKey) =>
    s === "all"
      ? statusCounts.reduce((n, c) => n + c._count._all, 0)
      : (statusCounts.find((c) => c.status === s)?._count._all ?? 0);
  const filtered = Boolean(q || type !== "all" || from || period !== "any" || status !== "all");
  const totalBatches = filtered ? await db.directSend.count({ where: scoped }) : all.length;

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string | number | undefined> = {
      mode: single ? "single" : undefined,
      q: q || undefined,
      status: status === "all" ? undefined : status,
      type: type === "all" ? undefined : type,
      from: from || undefined,
      period: period === "any" ? undefined : period,
      sort: sort === "newest" ? undefined : sort,
      page: undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/marketing/customize${s ? `?${s}` : ""}`;
  };

  const canEdit = (await currentPermissions()).has("personal.manage");
  const newButton =
    canEdit &&
    (single ? (
      <Button as="a" href="/marketing/customize/single">
        <Plus className="mr-1 h-4 w-4" /> New single email
      </Button>
    ) : (
      <Button as="a" href="/marketing/customize/new">
        <Plus className="mr-1 h-4 w-4" /> New bulk mail
      </Button>
    ));
  const [bulkCount, singleCount] = await Promise.all([
    db.directSend.count({ where: { AND: [scopedAll, { single: false }] } }),
    db.directSend.count({ where: { AND: [scopedAll, { single: true }] } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Customize mail"
        icon={Send}
        description={
          single
            ? "One email to anyone — Gmail, Outlook or any address — with CC, BCC and attachments."
            : "A different email to each person — from a CSV of email, name, subject, body and attachments."
        }
        actions={newButton}
      />

      <Tabs
        className="mb-4"
        items={[
          { href: "/marketing/customize", label: "Bulk (CSV)", active: !single, count: bulkCount },
          {
            href: "/marketing/customize?mode=single",
            label: "Single email",
            active: single,
            count: singleCount,
          },
        ]}
      />

      {totalBatches === 0 ? (
        single ? (
          <EmptyState
            icon={Mail}
            title="No single emails yet"
            description="Write one email to any address — with CC, BCC and attachments — and see when it's delivered and opened."
            action={newButton}
          />
        ) : (
          <EmptyState
            icon={Send}
            title="No bulk mails yet"
            description="Upload a CSV where each row is one email — e.g. offer letters, certificates or interview invites, each with its own subject, body and file."
            action={newButton}
          />
        )
      ) : (
        <>
          {/* Status tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={href({ status: s === "all" ? undefined : s })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                  status === s
                    ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "border-border text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800",
                )}
              >
                {STATUS_LABEL[s]}
                <span className="tabular-nums opacity-70">{countOf(s)}</span>
              </Link>
            ))}
          </div>

          {/* Search, filters, sort */}
          <form className="mb-4 flex flex-wrap items-center gap-2">
            {single && <input type="hidden" name="mode" value="single" />}
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder={
                  single
                    ? "Search subject or any recipient email…"
                    : "Search batch, recipient email or subject…"
                }
                className={`${control} w-full pl-9`}
              />
            </div>
            {!single && (
              <select name="type" defaultValue={type} className={control} aria-label="Type">
                {(Object.keys(TYPES) as TypeKey[]).map((k) => (
                  <option key={k} value={k}>
                    {TYPES[k]}
                  </option>
                ))}
              </select>
            )}
            <select name="from" defaultValue={from} className={control} aria-label="Sender">
              <option value="">All senders</option>
              {senders.map((s) => (
                <option key={s.fromEmail} value={s.fromEmail}>
                  {s.fromEmail}
                </option>
              ))}
            </select>
            <select name="period" defaultValue={period} className={control} aria-label="Created">
              {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
                <option key={k} value={k}>
                  {PERIODS[k]}
                </option>
              ))}
            </select>
            <select name="sort" defaultValue={sort} className={control} aria-label="Sort">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {(filtered || sort !== "newest") && (
              <span className="text-xs text-muted-foreground">
                {sorted.length}{" "}
                {single
                  ? `email${sorted.length === 1 ? "" : "s"}`
                  : `batch${sorted.length === 1 ? "" : "es"}`}
                .{" "}
                <Link
                  href={single ? "/marketing/customize?mode=single" : "/marketing/customize"}
                  className="text-emerald-700 hover:underline dark:text-emerald-300"
                >
                  Clear
                </Link>
              </span>
            )}
          </form>

          {shown.length === 0 ? (
            <EmptyState
              icon={Search}
              title={single ? "No matching emails" : "No matching batches"}
              description="Nothing matches this search and these filters."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{single ? "Email" : "Batch"}</TH>
                  <TH>Status</TH>
                  {!single && <TH className="text-right">Emails</TH>}
                  <TH className="text-right">Sent</TH>
                  <TH className="text-right">Opened</TH>
                  <TH className="text-right">Clicked</TH>
                  <TH className="text-right">Failed</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <tbody>
                {shown.map((s) => {
                  const m = summaries.get(s.id);
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/marketing/customize/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {single
                            ? `To ${s.toEmails[0] ?? "—"}${recipientsBeyondFirst(s) ? ` +${recipientsBeyondFirst(s)}` : ""}`
                            : s.kind === "PERSONAL"
                              ? "Personal"
                              : "Promotional"}{" "}
                          · {s.fromEmail}
                          {s._count.attachments > 0 &&
                            ` · ${s._count.attachments} file${s._count.attachments === 1 ? "" : "s"}`}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={TONE[s.status]}>{s.status}</Badge>
                      </TD>
                      {!single && <TD className="text-right tabular-nums">{s.totalRows.toLocaleString()}</TD>}
                      <TD className="text-right tabular-nums">{m ? m.sent.toLocaleString() : "—"}</TD>
                      <TD className="text-right tabular-nums">
                        {m ? (
                          <>
                            {m.opened.toLocaleString()}{" "}
                            <span className="text-xs text-muted-foreground">{pct(m.opened, m.sent)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {m ? (
                          <>
                            {m.clicked.toLocaleString()}{" "}
                            <span className="text-xs text-muted-foreground">{pct(m.clicked, m.sent)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {m?.failed ? <span className="text-red-700 dark:text-red-300">{m.failed}</span> : "—"}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">
                        {IST.format(s.createdAt)}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}

          {pages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} className="rounded border border-border px-2 py-1">
                  ← Prev
                </Link>
              )}
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link href={href({ page: page + 1 })} className="rounded border border-border px-2 py-1">
                  Next →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
