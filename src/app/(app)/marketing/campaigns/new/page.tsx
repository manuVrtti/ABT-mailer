import Link from "next/link";
import { Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, Input, Button } from "@/components/ui";
import { createDraftCampaign } from "../actions";

export const metadata = { title: "Create an email campaign" };
export const dynamic = "force-dynamic";

/**
 * Brevo-style "Create an email campaign" screen. Only asks for a name —
 * everything else (sender, recipients, subject, design) is set inline on the
 * edit page after the draft is created.
 */
export default async function CreateCampaignPage({
  searchParams,
}: {
  searchParams: { listId?: string; segmentId?: string };
}) {
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
        title="Create an email campaign"
        icon={Megaphone}
        description="Keep subscribers engaged by sharing your latest news, promoting your bestselling products, or announcing an upcoming event."
      />

      <div className="mx-auto max-w-2xl">
        <form action={createDraftCampaign} className="space-y-4">
          <input type="hidden" name="initialAudience" value={initialAudience} />

          <Card className="space-y-5">
            <div>
              <label htmlFor="name" className="text-sm font-semibold">
                Campaign name
              </label>
              <p className="text-xs text-muted-foreground">
                Internal label only — recipients don&apos;t see this.
              </p>
              <div className="mt-2">
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={128}
                  autoFocus
                  placeholder="Freshers Registration Drive — Sept 2026"
                />
              </div>
            </div>

            {preselectedLabel && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Recipients preselected
                </div>
                <div className="mt-0.5 text-sm font-medium">{preselectedLabel}</div>
                <div className="text-xs text-muted-foreground">You can change this on the next screen.</div>
              </div>
            )}
          </Card>

          <div className="flex justify-end gap-2">
            <Button as="a" href="/marketing/campaigns" variant="secondary">
              Cancel
            </Button>
            <Button type="submit">Create campaign</Button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <Link href="/marketing/campaigns" className="text-xs text-muted-foreground underline underline-offset-4">
            ← Back to campaigns
          </Link>
        </div>
      </div>
    </div>
  );
}
