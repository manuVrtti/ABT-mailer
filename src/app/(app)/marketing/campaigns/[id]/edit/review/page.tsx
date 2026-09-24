import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Rocket, CheckCircle2, AlertTriangle, Mail, Users, Palette } from "lucide-react";
import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import { CampaignWizardSteps } from "../../../_wizard-steps";
import { ActionsPanel } from "../../_actions-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign — Review" };

/**
 * Final wizard step. Shows a summary of every setting the user made in steps
 * 1-3, flags any incomplete pieces, and hosts the send-test / schedule /
 * send-now controls (via ActionsPanel).
 */
export default async function CampaignReviewPage({ params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      template: { select: { id: true, name: true, category: true } },
      segment: { select: { id: true, name: true, audienceSize: true } },
      list: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  });
  if (!campaign) notFound();
  if (campaign.status !== CampaignStatus.DRAFT) {
    redirect(`/marketing/campaigns/${campaign.id}`);
  }

  const audienceSet = Boolean(campaign.segmentId || campaign.listId);
  const designSet = Boolean(campaign.templateId && campaign.subject);
  const ready = audienceSet && designSet;

  const audienceSize = campaign.list
    ? campaign.list._count.members
    : campaign.segment?.audienceSize ?? null;

  return (
    <div>
      <PageHeader
        title={`Review — ${campaign.name}`}
        icon={Rocket}
        description="One last look before launch. Send a test to yourself first if you want."
      />
      <CampaignWizardSteps current="review" campaignId={campaign.id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-center gap-2">
              {ready ? (
                <>
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Ready to send</div>
                    <div className="text-xs text-muted-foreground">
                      All required fields are filled. Send a test, then launch when you're ready.
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Missing pieces</div>
                    <div className="text-xs text-muted-foreground">
                      {!audienceSet && "Recipients not set. "}
                      {!designSet && "Template or subject missing. "}
                      Fix these before launching.
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <SummaryRow
              icon={<Mail className="h-4 w-4" />}
              label="Setup"
              stepHref={`/marketing/campaigns/new`}
              value={
                <div className="text-sm">
                  <div className="font-medium">{campaign.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {campaign.fromName} &lt;{campaign.fromEmail}&gt;
                    {campaign.replyTo ? ` · replies to ${campaign.replyTo}` : ""}
                  </div>
                </div>
              }
            />
            <div className="my-3 border-t border-border/60" />
            <SummaryRow
              icon={<Users className="h-4 w-4" />}
              label="Recipients"
              stepHref={`/marketing/campaigns/${campaign.id}/edit/recipients`}
              value={
                campaign.list ? (
                  <div className="text-sm">
                    <div className="font-medium">List · {campaign.list.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {campaign.list._count.members.toLocaleString()} contact
                      {campaign.list._count.members === 1 ? "" : "s"}
                    </div>
                  </div>
                ) : campaign.segment ? (
                  <div className="text-sm">
                    <div className="font-medium">Segment · {campaign.segment.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {campaign.segment.audienceSize != null
                        ? `~${campaign.segment.audienceSize.toLocaleString()} contacts`
                        : "size not computed yet"}
                    </div>
                  </div>
                ) : (
                  <Badge tone="warning">Not set</Badge>
                )
              }
            />
            <div className="my-3 border-t border-border/60" />
            <SummaryRow
              icon={<Palette className="h-4 w-4" />}
              label="Design"
              stepHref={`/marketing/campaigns/${campaign.id}/edit/design`}
              value={
                campaign.template ? (
                  <div className="text-sm">
                    <div className="font-medium">{campaign.template.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {campaign.subject || <span className="italic">no subject</span>}
                    </div>
                    {campaign.previewText && (
                      <div className="text-xs text-muted-foreground">Preview: {campaign.previewText}</div>
                    )}
                  </div>
                ) : (
                  <Badge tone="warning">Not set</Badge>
                )
              }
            />
          </Card>

          {ready && (
            <ActionsPanel id={campaign.id} status={campaign.status} audienceSize={audienceSize} />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <div className="text-sm font-semibold">What happens on launch</div>
            <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>1. We materialize one job per recipient (idempotent).</li>
              <li>2. Suppressed contacts are skipped before SES ever sees them.</li>
              <li>3. Jobs are queued into QStash and delivered via SES.</li>
              <li>4. Delivery/bounce/open/click events flow into the campaign counters.</li>
            </ol>
          </Card>
          <Card>
            <div className="text-sm font-semibold">Safety net</div>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>• You can pause a running campaign — in-flight jobs finish, no new ones start.</li>
              <li>• Cancelling stops future sends but doesn't recall sent mail.</li>
              <li>• Every recipient carries an unsubscribe link.</li>
            </ul>
          </Card>
          <Link
            href="/marketing/campaigns"
            className="block text-center text-xs text-muted-foreground underline underline-offset-4"
          >
            ← Back to campaigns
          </Link>
        </aside>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/marketing/campaigns" className="text-xs text-muted-foreground underline underline-offset-4">
          Save & exit
        </Link>
        <div className="flex gap-2">
          <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit/design`} variant="secondary">
            ← Back to design
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  stepHref,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  stepHref: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {icon}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5">{value}</div>
        </div>
      </div>
      <Link href={stepHref} className="text-xs text-emerald-600 underline underline-offset-4">
        Edit
      </Link>
    </div>
  );
}
