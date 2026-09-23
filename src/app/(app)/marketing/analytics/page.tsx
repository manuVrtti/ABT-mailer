import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { CampaignStatus, EmailEventType } from "@prisma/client";
import { PageHeader, Card, EmptyState, Badge } from "@/components/ui";
import { MetricBar } from "@/components/metric-bar";
import { LineChart, type LineSeries } from "@/components/line-chart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing analytics" };

async function activitySeries14d() {
  const days = 14;
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const sinceMs = since.getTime();
  const events = await db.emailEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, type: true },
  });
  const bucket = () => new Array<number>(days).fill(0);
  const delivered = bucket();
  const opened = bucket();
  const clicked = bucket();
  const bounced = bucket();
  for (const e of events) {
    const idx = Math.floor((e.createdAt.getTime() - sinceMs) / 86_400_000);
    if (idx < 0 || idx >= days) continue;
    if (e.type === EmailEventType.DELIVERY) delivered[idx] = (delivered[idx] ?? 0) + 1;
    if (e.type === EmailEventType.OPEN) opened[idx] = (opened[idx] ?? 0) + 1;
    if (e.type === EmailEventType.CLICK) clicked[idx] = (clicked[idx] ?? 0) + 1;
    if (e.type === EmailEventType.BOUNCE) bounced[idx] = (bounced[idx] ?? 0) + 1;
  }
  const labels = Array.from({ length: days }, (_, i) => {
    const d = new Date(sinceMs + i * 86_400_000);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  return { delivered, opened, clicked, bounced, labels };
}

export default async function MarketingAnalyticsPage() {
  const [totals, campaigns, topClicks, activity] = await Promise.all([
    db.campaign.aggregate({
      _sum: {
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        bouncedCount: true,
        complainedCount: true,
        openedCount: true,
        clickedCount: true,
        unsubscribedCount: true,
      },
    }),
    db.campaign.findMany({
      where: { status: { in: [CampaignStatus.COMPLETED, CampaignStatus.SENDING] } },
      orderBy: { deliveredCount: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        sentCount: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
        bouncedCount: true,
        unsubscribedCount: true,
      },
    }),
    db.$queryRaw<Array<{ url: string; clicks: bigint }>>`
      SELECT (raw->'click'->>'link') as url, COUNT(*)::bigint as clicks
      FROM email_events
      WHERE type = ${EmailEventType.CLICK}::"email_event_type" AND raw->'click'->>'link' IS NOT NULL
      GROUP BY url
      ORDER BY clicks DESC
      LIMIT 10
    `.catch(() => [] as Array<{ url: string; clicks: bigint }>),
    activitySeries14d(),
  ]);

  const sent = totals._sum.sentCount ?? 0;
  const delivered = totals._sum.deliveredCount ?? 0;
  const bounced = totals._sum.bouncedCount ?? 0;
  const complained = totals._sum.complainedCount ?? 0;
  const opened = totals._sum.openedCount ?? 0;
  const clicked = totals._sum.clickedCount ?? 0;
  const unsub = totals._sum.unsubscribedCount ?? 0;

  const rate = (num: number, denom: number) => (denom > 0 ? (num / denom) * 100 : 0);

  const linesSeries: LineSeries[] = [
    { label: "Delivered", color: "#14b8a6", data: activity.delivered },
    { label: "Opened", color: "#f59e0b", data: activity.opened },
    { label: "Clicked", color: "#f43f5e", data: activity.clicked },
    { label: "Bounced", color: "#ef4444", data: activity.bounced },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing analytics"
        icon={BarChart3}
        description="Rates across every marketing send. Individual campaign detail pages show per-campaign numbers."
      />

      {/* Brevo-style: big hero number + progress-bar grid */}
      <div className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm dark:bg-slate-900/60">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emails sent (all time)</div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="text-5xl font-semibold tabular-nums">{sent.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-4">
          <MetricBar
            label="Delivery rate"
            value={`${rate(delivered, sent).toFixed(2)}%`}
            percent={rate(delivered, sent)}
            tone="emerald"
            hint={`${delivered.toLocaleString()} delivered`}
          />
          <MetricBar
            label="Open rate"
            value={`${rate(opened, delivered).toFixed(2)}%`}
            percent={rate(opened, delivered)}
            tone="teal"
            hint={`${opened.toLocaleString()} opens`}
          />
          <MetricBar
            label="Click rate"
            value={`${rate(clicked, delivered).toFixed(2)}%`}
            percent={rate(clicked, delivered)}
            tone="amber"
            hint={`${clicked.toLocaleString()} clicks`}
          />
          <MetricBar
            label="Click-to-open"
            value={`${rate(clicked, opened).toFixed(2)}%`}
            percent={rate(clicked, opened)}
            tone="sky"
          />
          <MetricBar
            label="Bounce rate"
            value={`${rate(bounced, sent).toFixed(2)}%`}
            percent={rate(bounced, sent)}
            tone="rose"
            hint={`${bounced.toLocaleString()} bounces`}
          />
          <MetricBar
            label="Complaint rate"
            value={`${rate(complained, delivered).toFixed(3)}%`}
            percent={rate(complained, delivered)}
            tone="red"
            hint={`${complained.toLocaleString()} complaints`}
          />
          <MetricBar
            label="Unsubscribe rate"
            value={`${rate(unsub, delivered).toFixed(2)}%`}
            percent={rate(unsub, delivered)}
            tone="slate"
            hint={`${unsub.toLocaleString()} unsubs`}
          />
        </div>

        <div className="mt-8">
          <LineChart series={linesSeries} height={200} xLabels={activity.labels} />
        </div>
      </div>

      {/* Top campaigns */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Top campaigns</h2>
        </div>
        {campaigns.length === 0 ? (
          <EmptyState icon={BarChart3} title="No sent campaigns yet" description="Launch a campaign to start seeing numbers here." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
            <ul className="divide-y divide-border/60">
              {campaigns.map((c) => {
                const openRate = c.deliveredCount > 0 ? (c.openedCount / c.deliveredCount) * 100 : 0;
                const clickRate = c.deliveredCount > 0 ? (c.clickedCount / c.deliveredCount) * 100 : 0;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/marketing/campaigns/${c.id}`}
                      className="grid grid-cols-6 items-center gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="col-span-6 sm:col-span-2">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          <Badge tone={c.status === CampaignStatus.COMPLETED ? "success" : "info"}>{c.status}</Badge>
                          <span className="ml-2">{c.deliveredCount.toLocaleString()} delivered</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <MetricBar label="Open rate" value={`${openRate.toFixed(1)}%`} percent={openRate} tone="teal" />
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <MetricBar label="Click rate" value={`${clickRate.toFixed(1)}%`} percent={clickRate} tone="amber" />
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</div>
                        <div className="text-sm font-semibold tabular-nums">{c.sentCount.toLocaleString()}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Top clicked links */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Top clicked links</h2>
        </div>
        <Card>
          {topClicks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No click events yet.</div>
          ) : (
            <ul className="space-y-3 text-sm">
              {topClicks.map((r, i) => (
                <li key={r.url} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-muted-foreground dark:bg-slate-800">
                      {i + 1}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={r.url}>
                      {r.url}
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums dark:bg-emerald-950/40 dark:text-emerald-300">
                    {Number(r.clicks).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <div className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm dark:bg-slate-900/60">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Want per-campaign breakdown?</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Open a campaign to see its recipient log, event stream, and delivery timeline.</div>
          </div>
          <Link
            href="/marketing/campaigns"
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:shadow-md"
          >
            All campaigns <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
