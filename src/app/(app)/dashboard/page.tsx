import Link from "next/link";
import { db } from "@/lib/db";
import { CampaignStatus, EmailJobStatus, EmailType } from "@prisma/client";
import { Badge, Table, THead, TR, TH, TD, EmptyState, Button } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [
    contactCount,
    registeredCount,
    marketingSentAgg,
    marketingDeliveredAgg,
    marketingClickedAgg,
    marketingBouncedAgg,
    recentCampaigns,
    conversionCount,
  ] = await Promise.all([
    db.marketingContact.count(),
    db.registeredUserRef.count(),
    db.emailJob.count({ where: { emailType: EmailType.MARKETING, status: { in: [EmailJobStatus.SENT, EmailJobStatus.DELIVERED] } } }),
    db.campaign.aggregate({ _sum: { deliveredCount: true } }),
    db.campaign.aggregate({ _sum: { clickedCount: true } }),
    db.campaign.aggregate({ _sum: { bouncedCount: true } }),
    db.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        deliveredCount: true,
        clickedCount: true,
      },
    }),
    db.conversionEvent.count({ where: { stage: "REGISTRATION" } }),
  ]);

  const delivered = marketingDeliveredAgg._sum.deliveredCount ?? 0;
  const clicked = marketingClickedAgg._sum.clickedCount ?? 0;
  const bounced = marketingBouncedAgg._sum.bouncedCount ?? 0;
  const deliveryRate = marketingSentAgg > 0 ? (delivered / marketingSentAgg) * 100 : 0;
  const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;
  const bounceRate = marketingSentAgg > 0 ? (bounced / marketingSentAgg) * 100 : 0;

  const stats = [
    { label: "Total contacts", value: contactCount.toLocaleString() },
    { label: "Registered users", value: registeredCount.toLocaleString() },
    { label: "Prospects", value: Math.max(0, contactCount - registeredCount).toLocaleString() },
    { label: "Emails sent (marketing)", value: marketingSentAgg.toLocaleString() },
    { label: "Delivery rate", value: `${deliveryRate.toFixed(1)}%` },
    { label: "Click rate", value: `${clickRate.toFixed(1)}%` },
    { label: "Bounce rate", value: `${bounceRate.toFixed(2)}%` },
    { label: "Registrations from email", value: conversionCount.toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Email Marketing</h1>
        <p className="text-sm text-muted-foreground">Overview of contacts, campaigns and deliverability.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium">Recent campaigns</div>
          <Button as="a" href="/marketing/campaigns" variant="secondary" size="sm">
            All campaigns
          </Button>
        </div>
        {recentCampaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first campaign to see performance here."
            action={<Button as="a" href="/marketing/campaigns/new">New campaign</Button>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Campaign</TH>
                <TH>Recipients</TH>
                <TH>Delivered</TH>
                <TH>Clicks</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {recentCampaigns.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="tabular-nums">{c.totalRecipients.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.deliveredCount.toLocaleString()}</TD>
                  <TD className="tabular-nums">{c.clickedCount.toLocaleString()}</TD>
                  <TD>
                    <Badge tone={c.status === CampaignStatus.COMPLETED ? "success" : c.status === CampaignStatus.SENDING ? "info" : "muted"}>
                      {c.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <Link href={`/marketing/campaigns/${c.id}`} className="text-xs underline underline-offset-4">
                      Open
                    </Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
