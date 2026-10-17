import Link from "next/link";
import { Download, MousePointerClick } from "lucide-react";
import { Card, SectionHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/lib/utils";
import { sourceConversions } from "@/server/conversions/stats";
import { lastConversionRun } from "@/server/conversions/refresh";
import { ATTRIBUTION_WINDOW_DAYS, parseGoal } from "@/server/conversions/kinds";
import { GoalPicker, RefreshConversionsButton } from "../../analytics/conversions/_controls";

const WHEN = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ago(d: Date): string {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

/** Campaign report: what recipients did in Klymb after this email. */
export async function CampaignConversions({
  campaign,
  canEdit,
}: {
  campaign: { id: string; deliveredCount: number; openedCount: number; clickedCount: number; conversionGoal: unknown };
  canEdit: boolean;
}) {
  const goal = parseGoal(campaign.conversionGoal);
  const [c, run] = await Promise.all([sourceConversions({ campaignId: campaign.id }, goal), lastConversionRun()]);
  const delivered = campaign.deliveredCount;
  const steps = [
    { label: "Delivered", n: delivered },
    { label: "Opened", n: campaign.openedCount },
    { label: "Clicked", n: campaign.clickedCount },
    { label: goal ? "Reached goal" : "Converted", n: goal ? c.goal ?? 0 : c.people, highlight: true },
  ];
  const pct = (n: number) => (delivered > 0 ? `${((n / delivered) * 100).toFixed(n / delivered < 0.01 && n > 0 ? 2 : 1)}%` : "—");

  return (
    <Card>
      <SectionHeader
        title="Conversions"
        description={`What recipients did in Klymb within ${ATTRIBUTION_WINDOW_DAYS} days of this email · the last email before an action gets the credit${run?.finishedAt ? ` · updated ${ago(run.finishedAt)}` : ""}`}
        actions={canEdit ? <RefreshConversionsButton size="sm" /> : undefined}
      />
      <div className="mb-4">
        <GoalPicker campaignId={campaign.id} goal={goal} canEdit={canEdit} />
      </div>

      {/* Funnel */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "relative rounded-lg border p-3",
              s.highlight ? "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30" : "border-border",
            )}
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("mt-1 text-xl font-semibold tabular", s.highlight && "text-brand-700 dark:text-brand-300")}>{s.n.toLocaleString()}</div>
            <div className="text-2xs text-muted-foreground">{i === 0 ? "100%" : `${pct(s.n)} of delivered`}</div>
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div
                className={cn("h-1 rounded-full", s.highlight ? "bg-brand-600" : "bg-slate-400 dark:bg-slate-500")}
                style={{ width: delivered ? `${Math.max(s.n ? 2 : 0, Math.min(100, (s.n / delivered) * 100))}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>

      {c.conversions === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No Klymb actions yet from this campaign&apos;s recipients within {ATTRIBUTION_WINDOW_DAYS} days of sending.
          {goal ? "" : " Set a goal to track one specific action."}
        </p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              {c.conversions.toLocaleString()} action{c.conversions === 1 ? "" : "s"} by {c.people.toLocaleString()} {c.people === 1 ? "person" : "people"} ·{" "}
              {c.clicked.toLocaleString()} after clicking
            </div>
            <ul className="space-y-2">
              {c.byLabel.map((l) => (
                <li key={l.label} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{l.label}</span>
                    <span className="tabular text-muted-foreground">{l.n}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(l.n / c.byLabel[0]!.n) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Who converted</span>
              <Link
                href={`/marketing/campaigns/${campaign.id}/conversions.csv`}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              >
                <Download className="h-3 w-3" /> CSV
              </Link>
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Person</TH>
                  <TH>Did</TH>
                  <TH>When</TH>
                </tr>
              </THead>
              <tbody>
                {c.recent.slice(0, 12).map((r, i) => (
                  <TR key={i}>
                    <TD className="max-w-[200px] truncate">{r.email}</TD>
                    <TD className="max-w-[220px]">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{r.label}</span>
                        {r.clicked && (
                          <span title="Clicked the email first">
                            <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                          </span>
                        )}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{WHEN.format(r.actionAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            {c.recent.length > 12 && <p className="mt-1 text-xs text-muted-foreground">+{c.recent.length - 12} more in the CSV.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
