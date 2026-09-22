import Link from "next/link";
import { db } from "@/lib/db";
import { CampaignStatus, EmailEventType } from "@prisma/client";
import { PageHeader, Card, Table, THead, TR, TH, TD, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing analytics" };

export default async function MarketingAnalyticsPage() {
  const [totals, campaigns, topClicks] = await Promise.all([
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
  ]);

  const sent = totals._sum.sentCount ?? 0;
  const delivered = totals._sum.deliveredCount ?? 0;
  const bounced = totals._sum.bouncedCount ?? 0;
  const complained = totals._sum.complainedCount ?? 0;
  const opened = totals._sum.openedCount ?? 0;
  const clicked = totals._sum.clickedCount ?? 0;
  const unsub = totals._sum.unsubscribedCount ?? 0;

  const rate = (num: number, denom: number) => (denom > 0 ? (num / denom) * 100 : 0);

  const stats = [
    { label: "Sent", value: sent.toLocaleString() },
    { label: "Delivered", value: delivered.toLocaleString() },
    { label: "Delivery rate", value: `${rate(delivered, sent).toFixed(1)}%` },
    { label: "Bounce rate", value: `${rate(bounced, sent).toFixed(2)}%` },
    { label: "Open rate", value: `${rate(opened, delivered).toFixed(1)}%` },
    { label: "Click rate", value: `${rate(clicked, delivered).toFixed(2)}%` },
    { label: "Click-to-open", value: `${rate(clicked, opened).toFixed(1)}%` },
    { label: "Complaint rate", value: `${rate(complained, delivered).toFixed(3)}%` },
    { label: "Unsubscribe rate", value: `${rate(unsub, delivered).toFixed(2)}%` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Marketing analytics" description="Rates across every marketing send. Individual campaign detail pages show per-campaign numbers." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-2 text-sm font-medium">Top campaigns</div>
        {campaigns.length === 0 ? (
          <EmptyState title="No sent campaigns yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Status</TH>
                <TH>Sent</TH>
                <TH>Delivered</TH>
                <TH>Opens</TH>
                <TH>Clicks</TH>
                <TH>Bounces</TH>
                <TH>Unsubs</TH>
              </TR>
            </THead>
            <tbody>
              {campaigns.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/marketing/campaigns/${c.id}`} className="underline underline-offset-4">
                      {c.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={c.status === CampaignStatus.COMPLETED ? "success" : "info"}>{c.status}</Badge>
                  </TD>
                  <TD className="tabular-nums">{c.sentCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.deliveredCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.openedCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.clickedCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.bouncedCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.unsubscribedCount.toLocaleString()}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <div className="mb-2 text-sm font-medium">Top clicked links</div>
        <Card>
          {topClicks.length === 0 ? (
            <div className="text-sm text-muted-foreground">No click events yet.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {topClicks.map((r) => (
                <li key={r.url} className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground" title={r.url}>
                    {r.url}
                  </span>
                  <span className="tabular-nums">{Number(r.clicks).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
