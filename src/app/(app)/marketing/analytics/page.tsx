import Link from "next/link";
import { BarChart3, Download, Eye, Mail, MousePointerClick, ShieldAlert, Undo2, XCircle } from "lucide-react";
import { Card, EmptyState, PageHeader, SectionHeader, StatCard } from "@/components/ui";
import { ActivityChart } from "@/components/activity-chart";
import { cn } from "@/lib/utils";
import { currentScope } from "@/server/access/scope";
import { currentPermissions, requirePermission } from "@/server/access/permissions";
import { PRESETS, bucketLabel } from "@/server/analytics/period";
import {
  MAIL_TYPES,
  analyticsReport,
  readAnalyticsParams,
  type AnalyticsParams,
  type Counts,
} from "@/server/analytics/report";
import { AnalyticsFilters } from "./_filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

const pct = (n: number, of: number, digits = 1) => (of > 0 ? `${((n / of) * 100).toFixed(digits)}%` : "—");
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : cur > 0 ? null : 0);
const rate = (n: number, of: number) => (of > 0 ? n / of : 0);
const rateChange = (cur: number, curOf: number, prev: number, prevOf: number) =>
  prevOf > 0 && curOf > 0 && rate(prev, prevOf) > 0
    ? (rate(cur, curOf) - rate(prev, prevOf)) / rate(prev, prevOf)
    : null;

const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export default async function AnalyticsPage({ searchParams }: { searchParams: AnalyticsParams }) {
  await requirePermission("analytics.view");
  const scope = await currentScope();
  const canExport = (await currentPermissions()).has("exports");
  const { period, by, filters, autoBy } = readAnalyticsParams(searchParams, scope);
  const r = await analyticsReport(scope, filters, period, by);
  const t = r.totals;
  const p = r.previous;

  const qs = new URLSearchParams(
    Object.entries(searchParams).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "",
    ),
  ).toString();
  const brandName = (domain: string) =>
    scope.brands.find((b) => b.domain.toLowerCase() === domain)?.name ?? domain;
  const chartLabels = r.series.map((s) =>
    (by === "month" ? MONTH : SHORT).format(new Date(`${s.key}T00:00:00Z`)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        icon={BarChart3}
        description="How much email went out and how it did — for any week, month, year or dates you pick."
        actions={
          canExport ? (
            <a
              href={`/marketing/analytics/report.csv${qs ? `?${qs}` : ""}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
            >
              <Download className="h-4 w-4" /> CSV
            </a>
          ) : undefined
        }
      />

      <AnalyticsFilters
        presets={Object.entries(PRESETS).map(([key, label]) => ({ key, label }))}
        preset={period.preset}
        fromDay={period.fromDay}
        toDay={period.toDay}
        types={Object.entries(MAIL_TYPES).map(([key, label]) => ({ key, label }))}
        selectedTypes={filters.types}
        brands={scope.brands.map((b) => ({ key: b.domain.toLowerCase(), label: b.name }))}
        brand={filters.domain ?? ""}
        by={by}
        autoBy={autoBy}
      />

      <p className="-mt-2 text-xs text-muted-foreground">
        {period.label} · {filters.types.map((x) => MAIL_TYPES[x]).join(" + ")}
        {filters.domain ? ` · ${brandName(filters.domain)}` : ""} · compared with the {period.days} days
        before. Opens and clicks count for emails sent in this period, whenever they happened.
      </p>

      {t.sent === 0 ? (
        <EmptyState
          icon={Mail}
          title="No emails sent in this period"
          description="Pick a longer period, or another type or brand."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Emails sent"
              value={t.sent.toLocaleString()}
              delta={change(t.sent, p.sent)}
              sub={`${p.sent.toLocaleString()} before`}
              icon={Mail}
            />
            <StatCard
              label="Delivered"
              value={pct(t.delivered, t.sent)}
              delta={rateChange(t.delivered, t.sent, p.delivered, p.sent)}
              sub={`${t.delivered.toLocaleString()} emails`}
            />
            <StatCard
              label="Opened"
              value={pct(t.opened, t.delivered)}
              delta={rateChange(t.opened, t.delivered, p.opened, p.delivered)}
              sub={`${t.opened.toLocaleString()} of delivered`}
              icon={Eye}
            />
            <StatCard
              label="Clicked"
              value={pct(t.clicked, t.delivered, 2)}
              delta={rateChange(t.clicked, t.delivered, p.clicked, p.delivered)}
              sub={`${t.clicked.toLocaleString()} of delivered`}
              icon={MousePointerClick}
            />
            <StatCard
              label="Bounced"
              value={pct(t.bounced, t.sent, 2)}
              delta={rateChange(t.bounced, t.sent, p.bounced, p.sent)}
              invert
              sub={`${t.bounced.toLocaleString()} emails`}
              icon={XCircle}
            />
            <StatCard
              label="Spam · unsubscribes"
              value={`${t.complained.toLocaleString()} · ${r.unsubscribes.toLocaleString()}`}
              delta={change(t.complained + r.unsubscribes, p.complained + r.previousUnsubscribes)}
              invert
              sub={`${pct(t.complained, t.sent, 2)} spam rate`}
              icon={ShieldAlert}
            />
          </div>

          <Card>
            <SectionHeader
              title="Emails over time"
              description={`Sent per ${by} (bars), opened and clicked (lines) · IST`}
            />
            <ActivityChart
              labels={chartLabels}
              sent={r.series.map((s) => s.sent)}
              opened={r.series.map((s) => s.opened)}
              clicked={r.series.map((s) => s.clicked)}
              height={320}
            />
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="overflow-hidden p-0 xl:col-span-2">
              <div className="px-5 pt-5">
                <SectionHeader title="Month by month" description="Every month in the period" />
              </div>
              <CountsTable
                rows={r.months.map((m) => ({ key: m.key, label: bucketLabel(m.key, "month"), counts: m }))}
                total={t}
              />
            </Card>

            <div className="space-y-4">
              <Card className="overflow-hidden p-0">
                <div className="px-5 pt-5">
                  <SectionHeader title="By type" />
                </div>
                <SmallTable
                  rows={r.byType.map((x) => ({ key: x.type, label: MAIL_TYPES[x.type], counts: x.counts }))}
                  total={t.sent}
                />
              </Card>
              {r.byDomain.length > 0 && (
                <Card className="overflow-hidden p-0">
                  <div className="px-5 pt-5">
                    <SectionHeader title="By brand" />
                  </div>
                  <SmallTable
                    rows={r.byDomain.map((x) => ({
                      key: x.domain,
                      label: brandName(x.domain),
                      counts: x.counts,
                    }))}
                    total={t.sent}
                  />
                </Card>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="overflow-hidden p-0">
              <div className="px-5 pt-5">
                <SectionHeader title="Top campaigns & mails" description="Most emails sent in this period" />
              </div>
              {r.topSources.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  Only transactional email in this period.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Sent</th>
                      <th className="px-3 py-2 text-right font-medium">Opened</th>
                      <th className="px-5 py-2 text-right font-medium">Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.topSources.map((s) => (
                      <tr key={s.id} className="border-t border-border first:border-t-0">
                        <td className="max-w-[260px] px-5 py-2">
                          <Link
                            href={
                              s.kind === "campaign"
                                ? `/marketing/campaigns/${s.id}`
                                : `/marketing/customize/${s.id}`
                            }
                            className="block truncate hover:underline"
                          >
                            {s.name}
                          </Link>
                          <span className="text-2xs text-muted-foreground">
                            {s.kind === "campaign" ? "Campaign" : "Customize mail"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.sent.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct(s.opened, s.sent)}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{pct(s.clicked, s.sent, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="px-5 pt-5">
                <SectionHeader title="Top clicked links" description="Clicks on emails sent in this period" />
              </div>
              {r.topLinks.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No clicks yet.</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {r.topLinks.map((l) => (
                    <li key={l.url} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="min-w-0 truncate hover:underline"
                        title={l.url}
                      >
                        {shortLink(l.url)}
                      </a>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {l.clicks.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Undo2 className="h-3.5 w-3.5" /> Unsubscribes are counted when they happened; everything else
            follows the emails sent in the period.
          </p>
        </>
      )}
    </div>
  );
}

function CountsTable({
  rows,
  total,
}: {
  rows: { key: string; label: string; counts: Counts }[];
  total: Counts;
}) {
  const cells = (c: Counts) => [
    c.sent.toLocaleString(),
    c.delivered.toLocaleString(),
    `${c.opened.toLocaleString()} · ${pct(c.opened, c.delivered)}`,
    `${c.clicked.toLocaleString()} · ${pct(c.clicked, c.delivered, 2)}`,
    `${c.bounced.toLocaleString()} · ${pct(c.bounced, c.sent, 2)}`,
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-5 py-2 text-left font-medium">Month</th>
            {["Sent", "Delivered", "Opened", "Clicked", "Bounced"].map((h) => (
              <th key={h} className="px-3 py-2 text-right font-medium last:pr-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={cn(
                "border-t border-border first:border-t-0",
                r.counts.sent === 0 && "text-muted-foreground",
              )}
            >
              <td className="whitespace-nowrap px-5 py-2">{r.label}</td>
              {cells(r.counts).map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums last:pr-5">
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="border-t-2 border-border bg-muted/30 font-medium">
              <td className="px-5 py-2">Total</td>
              {cells(total).map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums last:pr-5">
                  {v}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SmallTable({
  rows,
  total,
}: {
  rows: { key: string; label: string; counts: Counts }[];
  total: number;
}) {
  return (
    <ul className="divide-y divide-border border-t border-border">
      {rows.map((r) => (
        <li key={r.key} className="px-5 py-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span>{r.label}</span>
            <span className="tabular-nums">
              {r.counts.sent.toLocaleString()}{" "}
              <span className="text-xs text-muted-foreground">{pct(r.counts.sent, total)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-brand-600"
              style={{ width: `${total > 0 ? (r.counts.sent / total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1 text-2xs text-muted-foreground">
            {pct(r.counts.opened, r.counts.delivered)} opened · {pct(r.counts.clicked, r.counts.delivered, 2)}{" "}
            clicked
          </div>
        </li>
      ))}
    </ul>
  );
}
