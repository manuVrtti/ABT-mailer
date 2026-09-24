import Link from "next/link";
import { Check } from "lucide-react";

/**
 * Brevo-style campaign wizard step indicator. Rendered above every edit step.
 * Steps behind the current one are marked complete and clickable; the current
 * step is filled; future steps are dimmed and not clickable.
 */
export type WizardStep = "setup" | "recipients" | "design" | "review";

const STEP_ORDER: WizardStep[] = ["setup", "recipients", "design", "review"];

const STEP_LABEL: Record<WizardStep, string> = {
  setup: "Setup",
  recipients: "Recipients",
  design: "Design",
  review: "Review & send",
};

export function CampaignWizardSteps({
  current,
  campaignId,
}: {
  current: WizardStep;
  campaignId?: string;
}) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-white p-3 shadow-sm dark:bg-slate-900/60">
      {STEP_ORDER.map((step, idx) => {
        const isCurrent = idx === currentIdx;
        const isDone = idx < currentIdx;
        const isFuture = idx > currentIdx;
        const href =
          step === "setup"
            ? "/marketing/campaigns/new"
            : campaignId
            ? `/marketing/campaigns/${campaignId}/edit/${step}`
            : undefined;
        const clickable = (isDone || isCurrent) && href !== undefined;

        const circleClass = isCurrent
          ? "bg-emerald-500 text-white ring-4 ring-emerald-500/20"
          : isDone
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500";

        const labelClass = isCurrent
          ? "font-semibold text-foreground"
          : isDone
          ? "text-foreground"
          : "text-muted-foreground";

        const content = (
          <span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 ${clickable ? "hover:bg-slate-50 dark:hover:bg-slate-800" : ""}`}>
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition ${circleClass}`}
            >
              {isDone ? <Check className="h-4 w-4" /> : idx + 1}
            </span>
            <span className={`text-sm ${labelClass}`}>{STEP_LABEL[step]}</span>
          </span>
        );

        return (
          <li key={step} className="flex items-center gap-2">
            {clickable ? (
              <Link href={href!} aria-current={isCurrent ? "step" : undefined}>
                {content}
              </Link>
            ) : (
              <span aria-current={isCurrent ? "step" : undefined} aria-disabled={isFuture}>
                {content}
              </span>
            )}
            {idx < STEP_ORDER.length - 1 && (
              <span className={`h-px w-6 md:w-10 ${idx < currentIdx ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
