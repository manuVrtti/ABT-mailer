import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectSendStatus, EmailJobStatus, Prisma, Role } from "@prisma/client";
import { AlertTriangle, ArrowLeft, Download, Eye, MousePointerClick, Paperclip } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { brandForAddress } from "@/server/brands";
import { fileMatches, fillVariables } from "@/server/direct-send/body";
import { attachmentsForRow, checkDirectSendReady, renderDirectEmail } from "@/server/direct-send/service";
import { directSendStats, rowActivity } from "@/server/direct-send/stats";
import { AttachmentsManager, AutoRefresh, CancelButton, DeleteButton, LaunchButton, TestSend } from "./_controls";
import { currentScope, requireVisible } from "@/server/access/scope";
import { currentPermissions } from "@/server/access/permissions";

export const dynamic = "force-dynamic";
// Launching creates and queues one job per row.
export const maxDuration = 300;

const PAGE_SIZE = 100;

const STATUS_TONE: Record<DirectSendStatus, "muted" | "info" | "success" | "warning"> = {
  DRAFT: "muted",
  SENDING: "info",
  COMPLETED: "success",
  CANCELLED: "warning",
};

const FILTERS = {
  all: "All",
  opened: "Opened",
  not_opened: "Not opened",
  clicked: "Clicked",
  problems: "Bounced / failed",
} as const;
type FilterKey = keyof typeof FILTERS;

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "";
}

export default async function DirectSendPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { row?: string; page?: string; show?: string };
}) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER, Role.VIEWER]);
  const canEdit = (await currentPermissions()).has("personal.manage");
  const send = await db.directSend.findUnique({
    where: { id: params.id },
    include: { attachments: { select: { id: true, filename: true, size: true, forAll: true, contentType: true }, orderBy: { filename: "asc" } } },
  });
  if (!send) notFound();
  requireVisible(await currentScope(), send.fromEmail);

  const isDraft = send.status === DirectSendStatus.DRAFT;
  const filter: FilterKey = searchParams.show && searchParams.show in FILTERS ? (searchParams.show as FilterKey) : "all";
  const page = Math.max(1, Number(searchParams.page) || 1);

  // Rows for this page, narrowed by the engagement filter.
  const jobIdsWith = async (type: "OPEN" | "CLICK") =>
    (
      await db.$queryRaw<{ job_id: string }[]>(Prisma.sql`
        SELECT DISTINCT e.job_id FROM email_events e JOIN email_jobs j ON j.id = e.job_id
        WHERE j.direct_send_id = ${send.id} AND e.type = ${type}::email_event_type`)
    ).map((r) => r.job_id);
  let rowWhere: Prisma.DirectSendRowWhereInput = { directSendId: send.id };
  if (filter === "opened") rowWhere = { ...rowWhere, emailJobId: { in: await jobIdsWith("OPEN") } };
  if (filter === "clicked") rowWhere = { ...rowWhere, emailJobId: { in: await jobIdsWith("CLICK") } };
  if (filter === "not_opened") rowWhere = { ...rowWhere, emailJobId: { not: null, notIn: await jobIdsWith("OPEN") } };
  if (filter === "problems") {
    const bad = await db.emailJob.findMany({
      where: { directSendId: send.id, status: { in: [EmailJobStatus.BOUNCED, EmailJobStatus.FAILED, EmailJobStatus.COMPLAINED, EmailJobStatus.SKIPPED] } },
      select: { id: true },
    });
    rowWhere = { ...rowWhere, emailJobId: { in: bad.map((b) => b.id) } };
  }

  const [stats, matching, rows, problems, attachmentUse, converted] = await Promise.all([
    directSendStats(send.id, send.totalRows),
    db.directSendRow.count({ where: rowWhere }),
    db.directSendRow.findMany({
      where: rowWhere,
      orderBy: { rowNumber: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { rowNumber: true, email: true, name: true, subject: true, variables: true, attachmentNames: true, emailJobId: true },
    }),
    isDraft ? checkDirectSendReady(send.id) : Promise.resolve([]),
    db.directSendRow.findMany({ where: { directSendId: send.id }, select: { attachmentNames: true } }),
    db.attributedConversion
      .findMany({ where: { directSendId: send.id }, select: { email: true }, distinct: ["email"] })
      .then((r) => r.length),
  ]);
  const activity = await rowActivity(rows.map((r) => r.emailJobId).filter((x): x is string => Boolean(x)));

  // How many rows use each file, and which named files are missing.
  const names = new Map<string, number>();
  for (const r of attachmentUse) for (const n of r.attachmentNames) names.set(n, (names.get(n) ?? 0) + 1);
  const missing = [...names.entries()]
    .filter(([n]) => !send.attachments.some((a) => fileMatches(n, a.filename)))
    .map(([name, n]) => ({ name, rows: n }));
  const usesOf = (filename: string) =>
    attachmentUse.filter((r) => r.attachmentNames.some((n) => fileMatches(n, filename))).length;

  // Preview of one row, exactly as it will be sent.
  const previewNumber = Number(searchParams.row) || 1;
  const previewRow =
    (await db.directSendRow.findFirst({ where: { directSendId: send.id, rowNumber: previewNumber } })) ??
    (await db.directSendRow.findFirst({ where: { directSendId: send.id }, orderBy: { rowNumber: "asc" } }));
  const brand = await brandForAddress(send.fromEmail);
  const preview = previewRow ? renderDirectEmail(send, previewRow, brand) : null;
  const previewFiles = previewRow ? attachmentsForRow(send.attachments, previewRow.attachmentNames) : null;

  const done = stats.sent + stats.failed + stats.skipped;
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { row: searchParams.row, show: filter === "all" ? undefined : filter, page: page > 1 ? page : undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {send.status === DirectSendStatus.SENDING && <AutoRefresh />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/marketing/personal"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-white text-muted-foreground hover:text-foreground dark:bg-slate-900"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{send.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={STATUS_TONE[send.status]}>{send.status}</Badge>
              <span>{send.kind === "PERSONAL" ? "Personal" : "Promotional"}</span>·
              <span>
                {send.fromName} &lt;{send.fromEmail}&gt;
              </span>
              ·<span>{send.totalRows.toLocaleString()} emails</span>
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-start gap-2">
            {send.status === DirectSendStatus.SENDING && <CancelButton id={send.id} />}
            {send.status !== DirectSendStatus.SENDING && <DeleteButton id={send.id} name={send.name} />}
            {!isDraft && (
              <a
                href={`/marketing/personal/${send.id}/report.csv`}
                className="inline-flex items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:bg-slate-900"
              >
                <Download className="mr-1 h-4 w-4" /> Report CSV
              </a>
            )}
            {isDraft && <LaunchButton id={send.id} count={send.totalRows} disabled={problems.length > 0} />}
          </div>
        )}
      </div>

      {/* Analytics */}
      {!isDraft && (
        <section className="space-y-3">
          {send.status === DirectSendStatus.SENDING && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Sending… {done.toLocaleString()} of {send.totalRows.toLocaleString()} processed</span>
                <span>{pct(done, send.totalRows)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-2 bg-gradient-to-r from-emerald-500 to-teal-600 transition-all" style={{ width: pct(done, send.totalRows) === "—" ? "0%" : pct(done, send.totalRows) }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Emails" value={stats.total} />
            <Stat label="Sent" value={stats.sent} sub={pct(stats.sent, stats.total)} />
            <Stat label="Delivered" value={stats.delivered} sub={`${pct(stats.delivered, stats.sent)} of sent`} tone="success" />
            <Stat label="Opened" value={stats.opened} sub={`${pct(stats.opened, stats.delivered)} of delivered`} tone="info" icon={Eye} />
            <Stat label="Clicked" value={stats.clicked} sub={`${pct(stats.clicked, stats.delivered)} of delivered`} tone="info" icon={MousePointerClick} />
            <Stat label="Bounced" value={stats.bounced} sub={pct(stats.bounced, stats.sent)} tone={stats.bounced ? "danger" : undefined} />
            <Stat label="Failed" value={stats.failed} tone={stats.failed ? "danger" : undefined} />
            <Stat label="Skipped" value={stats.skipped} sub={stats.queued ? `${stats.queued} still queued` : undefined} />
          </div>
          <p className="text-xs text-muted-foreground">
            Opens are counted when the recipient&apos;s email app loads images, so the real open rate is usually a bit higher.
            Spam complaints: {stats.complained}.{" "}
            <Link href="/marketing/analytics/conversions" className="text-brand-700 hover:underline dark:text-brand-300">
              {converted.toLocaleString()} {converted === 1 ? "person" : "people"} acted in Klymb within a week
            </Link>
            .
          </p>
        </section>
      )}

      {/* Draft review */}
      {isDraft && (
        <>
          {problems.length > 0 ? (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <b>Fix {problems.length} problem{problems.length === 1 ? "" : "s"} before sending:</b>
                <ul className="mt-1 list-disc pl-5">
                  {problems.slice(0, 8).map((p, i) => (
                    <li key={i}>{p.rowNumber ? `Row ${p.rowNumber} (${p.email}): ${p.problem}` : p.problem}</li>
                  ))}
                  {problems.length > 8 && <li>…and {problems.length - 8} more</li>}
                </ul>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Everything checks out. Send yourself a test, then click <b>Send {send.totalRows.toLocaleString()} emails</b>.
            </div>
          )}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Rows */}
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {!isDraft &&
              (Object.keys(FILTERS) as FilterKey[]).map((k) => (
                <Link
                  key={k}
                  href={`/marketing/personal/${send.id}${qs({ show: k === "all" ? undefined : k, page: undefined })}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    filter === k ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-border text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  {FILTERS[k]}
                </Link>
              ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {matching.toLocaleString()} row{matching === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-muted-foreground dark:bg-slate-800/40">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">To</th>
                  <th className="px-3 py-2 text-left">Subject</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  {!isDraft && <th className="px-3 py-2 text-left">Opened</th>}
                  {!isDraft && <th className="px-3 py-2 text-left">Clicked</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const a = r.emailJobId ? activity.get(r.emailJobId) : undefined;
                  return (
                    <tr key={r.rowNumber} className={cn("border-t border-border", previewRow?.rowNumber === r.rowNumber && "bg-emerald-50/60 dark:bg-emerald-950/20")}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        <Link href={`/marketing/personal/${send.id}${qs({ row: r.rowNumber })}`} className="hover:underline">
                          {r.rowNumber}
                        </Link>
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <Link href={`/marketing/personal/${send.id}${qs({ row: r.rowNumber })}`} className="block hover:underline">
                          <div className="truncate font-medium">{r.name || r.email}</div>
                          {r.name && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                        </Link>
                      </td>
                      <td className="max-w-[240px] px-3 py-2">
                        <div className="truncate">{fillVariables(r.subject, (r.variables ?? {}) as Record<string, string>, false)}</div>
                        {r.attachmentNames.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="h-3 w-3" /> {r.attachmentNames.length}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <RowStatus draft={isDraft} activity={a} />
                      </td>
                      {!isDraft && (
                        <td className="px-3 py-2 text-xs">
                          {a?.openedAt ? (
                            <span className="text-sky-700 dark:text-sky-300" title={`First opened ${fmt(a.openedAt)} UTC`}>
                              ✓ {a.openCount > 1 ? `${a.openCount}×` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      {!isDraft && (
                        <td className="px-3 py-2 text-xs">
                          {a?.clickedAt ? (
                            <span className="text-violet-700 dark:text-violet-300" title={`First clicked ${fmt(a.clickedAt)} UTC`}>
                              ✓ {a.clickCount > 1 ? `${a.clickCount}×` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No rows match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs">
              {page > 1 && (
                <Link href={`/marketing/personal/${send.id}${qs({ page: page - 1 })}`} className="rounded border border-border px-2 py-1">
                  ← Prev
                </Link>
              )}
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link href={`/marketing/personal/${send.id}${qs({ page: page + 1 })}`} className="rounded border border-border px-2 py-1">
                  Next →
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Preview + test + files */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {preview && previewRow && (
            <Card className="overflow-hidden p-0">
              <div className="space-y-1 border-b border-border/60 bg-slate-50 px-4 py-3 text-xs dark:bg-slate-800/40">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview · row {previewRow.rowNumber} — click a row to change
                </div>
                <div>
                  <span className="text-muted-foreground">To:</span> {previewRow.email}
                </div>
                <div className="text-sm font-semibold">{preview.subject}</div>
              </div>
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-96 w-full bg-white" />
              {previewFiles && (previewFiles.files.length > 0 || previewFiles.missing.length > 0) && (
                <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-2">
                  {previewFiles.files.map((f) => (
                    <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                      <Paperclip className="h-3 w-3" /> {f.filename}
                    </span>
                  ))}
                  {previewFiles.missing.map((n) => (
                    <span key={n} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200">
                      <AlertTriangle className="h-3 w-3" /> {n} missing
                    </span>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="border-t border-border/60 px-4 py-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Send this row&apos;s email to yourself</div>
                  <TestSend id={send.id} rowNumber={previewRow.rowNumber} defaultTo={user.email ?? ""} />
                </div>
              )}
            </Card>
          )}

          <Card>
            <div className="mb-2 text-sm font-medium">Attachments</div>
            <AttachmentsManager
              id={send.id}
              editable={isDraft && canEdit}
              attachments={send.attachments.map((a) => ({ ...a, uses: usesOf(a.filename) }))}
              missing={missing}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "success" | "info" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const color =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "info"
        ? "text-sky-700 dark:text-sky-300"
        : tone === "danger"
          ? "text-red-700 dark:text-red-300"
          : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums", color)}>{value.toLocaleString()}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RowStatus({
  draft,
  activity,
}: {
  draft: boolean;
  activity?: { status: EmailJobStatus; errorMessage: string | null; deliveredAt: Date | null };
}) {
  if (draft) return <Badge tone="muted">Ready</Badge>;
  if (!activity) return <Badge tone="muted">Not queued</Badge>;
  const s = activity.status;
  const map: Record<EmailJobStatus, [string, "muted" | "info" | "success" | "warning" | "destructive"]> = {
    PENDING: ["Queued", "info"],
    QUEUED: ["Queued", "info"],
    SENDING: ["Sending", "info"],
    SENT: ["Sent", "info"],
    DELIVERED: ["Delivered", "success"],
    BOUNCED: ["Bounced", "destructive"],
    COMPLAINED: ["Marked spam", "destructive"],
    FAILED: ["Failed", "destructive"],
    SKIPPED: ["Skipped", "warning"],
  };
  const [label, tone] = map[s];
  return (
    <span title={activity.errorMessage ?? undefined}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}
