import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Palette, Mail } from "lucide-react";
import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, Card, Button, Input, Label, EmptyState } from "@/components/ui";
import { CampaignWizardSteps } from "../../../_wizard-steps";
import { updateCampaignDesign } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign — Design" };

export default async function CampaignDesignPage({ params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      status: true,
      subject: true,
      previewText: true,
      templateId: true,
    },
  });
  if (!campaign) notFound();
  if (campaign.status !== CampaignStatus.DRAFT) {
    redirect(`/marketing/campaigns/${campaign.id}`);
  }

  const templates = await db.emailTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, category: true, previewText: true, updatedAt: true },
  });

  return (
    <div>
      <PageHeader
        title={`Design — ${campaign.name}`}
        icon={Palette}
        description="Pick the template and write the subject line and inbox preview text."
      />
      <CampaignWizardSteps current="design" campaignId={campaign.id} />

      {templates.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No templates yet"
          description="Create your first email template before continuing."
          action={
            <Button as="a" href="/marketing/templates/new">
              Create template
            </Button>
          }
        />
      ) : (
        <form action={updateCampaignDesign} className="space-y-5">
          <input type="hidden" name="id" value={campaign.id} />

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-emerald-600" />
              <div className="text-sm font-semibold">Template</div>
              <span className="text-xs text-muted-foreground">The email body — you can send a test after this step.</span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {templates.map((t) => {
                const checked = campaign.templateId === t.id;
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                        : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="templateId"
                      value={t.id}
                      defaultChecked={checked}
                      className="mt-1 h-4 w-4 accent-emerald-500"
                      required
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{t.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {t.category}
                        </span>
                      </div>
                      {t.previewText && (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.previewText}</div>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Updated {t.updatedAt.toISOString().slice(0, 10)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Subject & preview</div>
            <div>
              <Label htmlFor="subject">Subject line</Label>
              <Input
                id="subject"
                name="subject"
                required
                maxLength={300}
                defaultValue={campaign.subject}
                placeholder="Registrations open for {{event_name}}"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Personalisation tokens like <code>{"{{first_name}}"}</code> get replaced per recipient.
              </p>
            </div>
            <div>
              <Label htmlFor="previewText">Preview text (optional)</Label>
              <Input
                id="previewText"
                name="previewText"
                maxLength={300}
                defaultValue={campaign.previewText ?? ""}
                placeholder="Shown next to the subject in Gmail, Outlook, etc."
              />
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <Link href="/marketing/campaigns" className="text-xs text-muted-foreground underline underline-offset-4">
              Save & exit
            </Link>
            <div className="flex gap-2">
              <Button as="a" href={`/marketing/campaigns/${campaign.id}/edit/recipients`} variant="secondary">
                ← Back
              </Button>
              <Button type="submit">Continue → Review</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
