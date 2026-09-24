import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionsPanel } from "./_actions-panel";
import type { CampaignStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

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

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      segment: { select: { id: true, name: true, audienceSize: true } },
      list: { select: { id: true, name: true, color: true } },
    },
  });
  if (!campaign) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={
          <>
            <Badge tone={statusTone[campaign.status]}>{campaign.status}</Badge>
            {" · "}
            slug <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{campaign.slug}</code>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Subject" value={campaign.subject} />
              <Field label="From" value={`${campaign.fromName} <${campaign.fromEmail}>`} />
              <Field label="Reply-to" value={campaign.replyTo ?? "—"} />
              <Field label="Preview text" value={campaign.previewText ?? "—"} />
              <Field
                label="Template"
                value={
                  campaign.template ? (
                    <Link className="underline underline-offset-4" href={`/marketing/templates/${campaign.template.id}`}>
                      {campaign.template.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Audience"
                value={
                  campaign.list ? (
                    <Link className="underline underline-offset-4" href={`/marketing/contacts/lists/${campaign.list.id}`}>
                      List · {campaign.list.name}
                    </Link>
                  ) : campaign.segment ? (
                    <Link className="underline underline-offset-4" href={`/marketing/segments/${campaign.segment.id}`}>
                      Segment · {campaign.segment.name}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field
                label="Scheduled for"
                value={campaign.scheduledAt ? campaign.scheduledAt.toISOString().replace("T", " ").slice(0, 16) : "—"}
              />
              <Field
                label="Started"
                value={campaign.startedAt ? campaign.startedAt.toISOString().replace("T", " ").slice(0, 16) : "—"}
              />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Recipients" value={campaign.totalRecipients} />
            <Stat label="Sent" value={campaign.sentCount} />
            <Stat label="Delivered" value={campaign.deliveredCount} tone="success" />
            <Stat label="Bounced" value={campaign.bouncedCount} tone="destructive" />
            <Stat label="Opened" value={campaign.openedCount} tone="info" />
            <Stat label="Clicked" value={campaign.clickedCount} tone="info" />
            <Stat label="Complained" value={campaign.complainedCount} tone="destructive" />
            <Stat label="Unsubscribed" value={campaign.unsubscribedCount} tone="warning" />
          </div>
        </div>

        <ActionsPanel id={campaign.id} status={campaign.status} audienceSize={campaign.segment?.audienceSize ?? null} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "destructive" | "info";
}) {
  const color =
    tone === "success"
      ? "text-green-700 dark:text-green-300"
      : tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "destructive"
      ? "text-destructive"
      : tone === "info"
      ? "text-blue-700 dark:text-blue-300"
      : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
