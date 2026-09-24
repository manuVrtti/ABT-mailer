import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Users, ListChecks, Filter } from "lucide-react";
import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, Card, Button, EmptyState } from "@/components/ui";
import { CampaignWizardSteps } from "../../../_wizard-steps";
import { updateCampaignAudience } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign — Recipients" };

export default async function CampaignRecipientsPage({ params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, status: true, segmentId: true, listId: true },
  });
  if (!campaign) notFound();
  // Editing recipients only makes sense while the campaign is still a draft.
  if (campaign.status !== CampaignStatus.DRAFT) {
    redirect(`/marketing/campaigns/${campaign.id}`);
  }

  const [lists, segments] = await Promise.all([
    db.contactList.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, color: true, _count: { select: { members: true } } },
    }),
    db.segment.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, audienceSize: true },
    }),
  ]);

  const currentValue = campaign.listId
    ? `list:${campaign.listId}`
    : campaign.segmentId
    ? `segment:${campaign.segmentId}`
    : "";

  const hasAny = lists.length + segments.length > 0;

  return (
    <div>
      <PageHeader
        title={`Recipients — ${campaign.name}`}
        icon={Users}
        description="Pick who this campaign goes to. A list is a fixed set of contacts; a segment is a rule-based query."
      />
      <CampaignWizardSteps current="recipients" campaignId={campaign.id} />

      {!hasAny ? (
        <EmptyState
          icon={Users}
          title="No lists or segments yet"
          description="Create a list of contacts or a rule-based segment before choosing recipients."
          action={
            <div className="flex gap-2">
              <Button as="a" href="/marketing/contacts/lists/new">
                Create list
              </Button>
              <Button as="a" href="/marketing/segments/new" variant="secondary">
                Create segment
              </Button>
            </div>
          }
        />
      ) : (
        <form action={updateCampaignAudience} className="space-y-5">
          <input type="hidden" name="id" value={campaign.id} />

          {lists.length > 0 && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-emerald-600" />
                <div className="text-sm font-semibold">Lists</div>
                <span className="text-xs text-muted-foreground">Fixed sets of contacts you've curated.</span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {lists.map((l) => {
                  const value = `list:${l.id}`;
                  const checked = currentValue === value;
                  return (
                    <label
                      key={l.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                          : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="audience"
                          value={value}
                          defaultChecked={checked}
                          className="h-4 w-4 accent-emerald-500"
                          required
                        />
                        <div>
                          <div className="text-sm font-medium">{l.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {l._count.members.toLocaleString()} contact{l._count.members === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}

          {segments.length > 0 && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Filter className="h-4 w-4 text-emerald-600" />
                <div className="text-sm font-semibold">Segments</div>
                <span className="text-xs text-muted-foreground">Contacts that match a set of rules.</span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {segments.map((s) => {
                  const value = `segment:${s.id}`;
                  const checked = currentValue === value;
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                          : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="audience"
                          value={value}
                          defaultChecked={checked}
                          className="h-4 w-4 accent-emerald-500"
                          required
                        />
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.audienceSize != null ? `~${s.audienceSize.toLocaleString()} contacts` : "size not computed"}
                            {s.description ? ` · ${s.description}` : ""}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Link href="/marketing/campaigns" className="text-xs text-muted-foreground underline underline-offset-4">
              Save & exit
            </Link>
            <div className="flex gap-2">
              <Button as="a" href="/marketing/campaigns/new" variant="secondary">
                ← Back
              </Button>
              <Button type="submit">Continue → Design</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
