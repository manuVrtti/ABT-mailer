import Link from "next/link";
import { Download, MailOpen, MousePointerClick, Search } from "lucide-react";
import { Card } from "@/components/ui";
import {
  ACTIVITY_FILTERS,
  getRecipientActivity,
  type ActivityFilter,
  type RecipientActivity,
} from "@/server/campaigns/activity";

const PAGE_SIZE = 50;

const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "All",
  opened: "Opened",
  clicked: "Clicked",
  not_opened: "Not opened",
  bounced: "Bounced",
};

export function parseActivityFilter(v: string | undefined): ActivityFilter {
  return (ACTIVITY_FILTERS as readonly string[]).includes(v ?? "") ? (v as ActivityFilter) : "all";
}

/** "Who opened / clicked" table on the campaign detail page. */
export async function RecipientActivitySection({
  campaignId,
  filter,
  search,
  page,
}: {
  campaignId: string;
  filter: ActivityFilter;
  search: string;
  page: number;
}) {
  const { rows, total } = await getRecipientActivity(campaignId, {
    filter,
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (next: { filter?: ActivityFilter; page?: number }) => {
    const p = new URLSearchParams();
    const f = next.filter ?? filter;
    if (f !== "all") p.set("activity", f);
    if (search) p.set("q", search);
    const pg = next.page ?? 1;
    if (pg > 1) p.set("page", String(pg));
    const qs = p.toString();
    return `/marketing/campaigns/${campaignId}${qs ? `?${qs}` : ""}#activity`;
  };

  const csvParams = new URLSearchParams();
  if (filter !== "all") csvParams.set("activity", filter);
  if (search) csvParams.set("q", search);
  const csvHref = `/marketing/campaigns/${campaignId}/activity.csv${csvParams.toString() ? `?${csvParams}` : ""}`;

  return (
    <Card>
      <div id="activity" className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold">Recipient activity</div>
          <div className="text-xs text-muted-foreground">
            Who opened the email and which links they clicked. Opens need images to load, so some are missed and
            Apple Mail can report opens automatically. Clicks are the most reliable signal.
          </div>
        </div>
        <a
          href={csvHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_FILTERS.map((f) => (
            <Link
              key={f}
              href={href({ filter: f })}
              scroll={false}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                f === filter
                  ? "bg-emerald-600 text-white"
                  : "border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </div>
        <form method="get" action={`/marketing/campaigns/${campaignId}#activity`} className="relative">
          {filter !== "all" && <input type="hidden" name="activity" value={filter} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search name or email"
            aria-label="Search recipients"
            className="h-8 w-56 rounded-md border border-border/60 bg-white pl-8 pr-2 text-xs outline-none focus:border-emerald-400 dark:bg-slate-900"
          />
        </form>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-2 pr-3 font-medium">Recipient</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Opens</th>
              <th className="py-2 pr-3 font-medium">Clicks</th>
              <th className="py-2 font-medium">Links clicked</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                  No recipients match this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => <ActivityRow key={r.jobId} r={r} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total.toLocaleString()} recipient{total === 1 ? "" : "s"}
          {pages > 1 && ` · page ${page} of ${pages}`}
        </span>
        {pages > 1 && (
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: page - 1 })} scroll={false} className="rounded-md border px-2 py-1 hover:bg-slate-50">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: page + 1 })} scroll={false} className="rounded-md border px-2 py-1 hover:bg-slate-50">
                Next
              </Link>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ActivityRow({ r }: { r: RecipientActivity }) {
  return (
    <tr className="border-b border-border/40 align-top last:border-0">
      <td className="py-2.5 pr-3">
        <div className="font-medium">{r.name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{r.email}</div>
      </td>
      <td className="py-2.5 pr-3">
        <StatusPill r={r} />
      </td>
      <td className="py-2.5 pr-3">
        {r.opens > 0 ? (
          <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
            <MailOpen className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">{r.opens}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
        {r.firstOpenAt && <div className="text-[11px] text-muted-foreground">first {fmt(r.firstOpenAt)}</div>}
      </td>
      <td className="py-2.5 pr-3">
        {r.clicks > 0 ? (
          <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300">
            <MousePointerClick className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums">{r.clicks}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="max-w-[340px] py-2.5">
        {r.links.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="space-y-0.5">
            {r.links.map((l) => (
              <li key={l} className="truncate text-xs">
                <a href={l} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline dark:text-sky-300" title={l}>
                  {l.replace(/^https?:\/\//, "")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ r }: { r: RecipientActivity }) {
  const [label, cls] =
    r.status === "BOUNCED"
      ? ["Bounced", "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"]
      : r.status === "COMPLAINED"
      ? ["Complained", "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"]
      : r.status === "FAILED"
      ? ["Failed", "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"]
      : r.status === "SKIPPED"
      ? ["Skipped", "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"]
      : r.clicks > 0
      ? ["Clicked", "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"]
      : r.opens > 0
      ? ["Opened", "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300"]
      : r.delivered
      ? ["Delivered", "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"]
      : r.sentAt
      ? ["Sent", "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"]
      : ["Queued", "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function fmt(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
