import Link from "next/link";
import { Megaphone, Lightbulb } from "lucide-react";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { PageHeader, Card, Input, Label, Button } from "@/components/ui";
import { createDraftCampaign } from "../actions";
import { CampaignWizardSteps } from "../_wizard-steps";

export const metadata = { title: "New campaign — Setup" };
export const dynamic = "force-dynamic";

export default async function NewCampaignSetupPage({
  searchParams,
}: {
  searchParams: { listId?: string; segmentId?: string };
}) {
  const env = getServerEnv();

  // Look up the preselected audience name for the tip card so the user sees
  // which list/segment they'll be sending to before they name the campaign.
  let preselectedLabel: string | null = null;
  if (searchParams.listId) {
    const l = await db.contactList.findUnique({ where: { id: searchParams.listId }, select: { name: true } });
    if (l) preselectedLabel = `List · ${l.name}`;
  } else if (searchParams.segmentId) {
    const s = await db.segment.findUnique({ where: { id: searchParams.segmentId }, select: { name: true } });
    if (s) preselectedLabel = `Segment · ${s.name}`;
  }
  const initialAudience = searchParams.listId
    ? `list:${searchParams.listId}`
    : searchParams.segmentId
    ? `segment:${searchParams.segmentId}`
    : "";

  return (
    <div>
      <PageHeader
        title="New campaign"
        icon={Megaphone}
        description="Give the campaign a name and pick your sender. You'll choose recipients and content in the next steps."
      />
      <CampaignWizardSteps current="setup" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form action={createDraftCampaign} className="space-y-4 lg:col-span-2">
          <input type="hidden" name="initialAudience" value={initialAudience} />

          <Card className="space-y-4">
            <div>
              <div className="text-sm font-semibold">Campaign name</div>
              <p className="text-xs text-muted-foreground">Internal label only — recipients don't see this.</p>
              <div className="mt-2">
                <Input id="name" name="name" required maxLength={200} placeholder="Freshers Registration Drive — Sept 2026" aria-label="Campaign name" />
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <div className="text-sm font-semibold">Sender</div>
              <p className="text-xs text-muted-foreground">Who this email appears to come from in the inbox.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="fromName">From name</Label>
                <Input id="fromName" name="fromName" defaultValue={env.SES_FROM_NAME} required maxLength={120} />
              </div>
              <div>
                <Label htmlFor="fromEmail">From email</Label>
                <Input id="fromEmail" name="fromEmail" type="email" defaultValue={env.SES_FROM_EMAIL} required />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="replyTo">Reply-to (optional)</Label>
                <Input id="replyTo" name="replyTo" type="email" defaultValue={env.SES_REPLY_TO ?? ""} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Replies land here instead of the From address. Leave blank to reply to the From email.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button as="a" href="/marketing/campaigns" variant="secondary">
              Cancel
            </Button>
            <Button type="submit">Continue → Recipients</Button>
          </div>
        </form>

        <aside className="space-y-4">
          {preselectedLabel && (
            <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Recipients ready
              </div>
              <div className="mt-1 text-sm font-medium">{preselectedLabel}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                We'll use this on the next step — you can change it there.
              </p>
            </Card>
          )}
          <Card>
            <div className="flex items-start gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Sender tips</div>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <li>• Use a from name people recognize — "ABTalks Team" beats "no-reply".</li>
                  <li>• Send from a verified domain address; unverified addresses get filtered.</li>
                  <li>• A reply-to that a human reads improves deliverability over time.</li>
                </ul>
              </div>
            </div>
          </Card>
          <Card>
            <div className="text-sm font-semibold">What's next</div>
            <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>2. Pick who receives this campaign.</li>
              <li>3. Pick the template and write the subject line.</li>
              <li>4. Review the summary, then send or schedule.</li>
            </ol>
            <Link href="/marketing/campaigns" className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-4">
              ← Back to campaigns
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
