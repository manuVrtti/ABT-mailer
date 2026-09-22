import Link from "next/link";
import { db } from "@/lib/db";
import type { CampaignStatus } from "@prisma/client";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

const statusTone: Record<CampaignStatus, "muted" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "muted",
  SCHEDULED: "info",
  QUEUED: "info",
  SENDING: "info",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "warning",
  FAILED: "destructive",
};

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { segment: { select: { name: true } }, template: { select: { name: true } } },
  });
  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One-off and recurring marketing emails. Every send is filtered against suppression before touching the queue."
        actions={<Button as="a" href="/marketing/campaigns/new">New campaign</Button>}
      />
      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign — pick an audience, a template, and hit send."
          action={<Button as="a" href="/marketing/campaigns/new">Create campaign</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Recipients</TH>
              <TH>Sent</TH>
              <TH>Clicked</TH>
              <TH>Template</TH>
              <TH>Segment</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {campaigns.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>
                  <Badge tone={statusTone[c.status]}>{c.status}</Badge>
                </TD>
                <TD className="tabular-nums">{c.totalRecipients.toLocaleString()}</TD>
                <TD className="tabular-nums">{c.sentCount.toLocaleString()}</TD>
                <TD className="tabular-nums">{c.clickedCount.toLocaleString()}</TD>
                <TD className="text-xs text-muted-foreground">{c.template?.name ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">{c.segment?.name ?? "—"}</TD>
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
  );
}
