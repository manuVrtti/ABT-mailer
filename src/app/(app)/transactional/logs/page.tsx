import Link from "next/link";
import { Download, Eye, RefreshCw, ScrollText } from "lucide-react";
import { PageHeader, Table, THead, TR, TH, TD, EmptyState, Button } from "@/components/ui";
import { LOG_EVENTS, LOG_EVENT_LABEL, parseLogFilters, queryEmailLogs, type LogFilters } from "@/server/logs/query";
import { EventPill, fmtIst } from "./_shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logs" };

const PAGE_SIZE = 50;

const field = "rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900";

function qs(f: LogFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({
    ...(f.q ? { q: f.q, field: f.field } : {}),
    ...(f.event !== "all" ? { event: f.event } : {}),
    ...(f.type !== "all" ? { type: f.type } : {}),
    from: f.fromDay,
    to: f.toDay,
    ...extra,
  });
  return p.toString();
}

export default async function EmailLogsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const f = parseLogFilters(searchParams);
  const { rows, total, nextBefore } = await queryEmailLogs(f, PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Logs"
        icon={ScrollText}
        description="Every event that happened to your emails — campaigns and transactional. Times are IST."
        actions={
          <>
            <Button as="a" href={`/transactional/logs?${qs(f)}`} variant="secondary">
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            <Button as="a" href={`/transactional/logs/export.csv?${qs(f)}`} variant="secondary">
              <Download className="mr-1 h-4 w-4" />
              Download CSV
            </Button>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex min-w-[280px] flex-1">
          <select name="field" defaultValue={f.field} className={`${field} rounded-r-none border-r-0`}>
            <option value="recipient">Recipient (To)</option>
            <option value="subject">Subject</option>
            <option value="kind">Email type / campaign</option>
          </select>
          <input name="q" type="search" defaultValue={f.q} placeholder="Type keywords here" className={`${field} w-full rounded-l-none`} />
        </div>
        <label className="text-xs text-muted-foreground">
          From
          <input name="from" type="date" defaultValue={f.fromDay} className={`${field} mt-1 block`} />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input name="to" type="date" defaultValue={f.toDay} className={`${field} mt-1 block`} />
        </label>
        <select name="event" defaultValue={f.event} className={field} aria-label="Event">
          <option value="all">All events</option>
          {LOG_EVENTS.map((e) => (
            <option key={e} value={e}>
              {LOG_EVENT_LABEL[e]}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={f.type} className={field} aria-label="Email type">
          <option value="all">All emails</option>
          <option value="transactional">Transactional</option>
          <option value="marketing">Campaigns</option>
        </select>
        <Button type="submit">Apply</Button>
      </form>

      <p className="mb-2 text-lg font-semibold tabular-nums">{total.toLocaleString()} logs</p>

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No logs" description="Nothing matches these filters in this date range." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH />
              <TH>Event</TH>
              <TH>Date</TH>
              <TH>Subject</TH>
              <TH>Recipient</TH>
              <TH>Type</TH>
              <TH>From</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD>
                  <Link href={`/transactional/logs/${r.jobId}`} aria-label="View email" className="text-violet-600 hover:text-violet-800">
                    <Eye className="h-4 w-4" />
                  </Link>
                </TD>
                <TD>
                  <EventPill event={r.event} />
                  {r.detail && (r.event === "bounced" || r.event === "failed" || r.event === "skipped" || r.event === "clicked") && (
                    <div className="mt-1 max-w-[220px] truncate text-[10px] text-muted-foreground" title={r.detail}>
                      {r.detail}
                    </div>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-xs">{fmtIst(r.at)}</TD>
                <TD className="max-w-[320px]">
                  <Link href={`/transactional/logs/${r.jobId}`} className="block truncate underline-offset-2 hover:underline" title={r.subject}>
                    {r.subject}
                  </Link>
                </TD>
                <TD className="text-xs">{r.recipient}</TD>
                <TD>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{r.kind}</code>
                </TD>
                <TD className="max-w-[200px] text-xs text-muted-foreground">
                  <span className="block truncate" title={r.from}>
                    {r.from}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <div className="mt-4 flex justify-between text-sm">
        {f.before ? (
          <Link href={`/transactional/logs?${qs(f)}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {nextBefore && (
          <Link
            href={`/transactional/logs?${qs(f, { before: nextBefore.toISOString() })}`}
            className="text-emerald-700 hover:underline dark:text-emerald-300"
          >
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
