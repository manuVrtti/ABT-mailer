/**
 * Metric row with a percentage value and a horizontal progress bar underneath.
 * The Brevo pattern used across their Statistics screens — instant visual read
 * of "how does this metric compare to 100%".
 *
 * Renders:
 *   Label ................. 96.23%
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░
 */
export function MetricBar({
  label,
  value,
  percent,
  tone = "emerald",
  hint,
}: {
  label: string;
  /** The formatted display value, e.g. "96.23%" or "1,234" or "12/500". */
  value: string;
  /** 0-100 — where the fill bar should stop. Clamped for safety. */
  percent: number;
  tone?: "emerald" | "teal" | "sky" | "amber" | "rose" | "slate" | "red";
  hint?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  const barColor: Record<typeof tone, string> = {
    emerald: "bg-emerald-500",
    teal: "bg-teal-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    slate: "bg-slate-500",
    red: "bg-red-500",
  };
  const textColor: Record<typeof tone, string> = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    teal: "text-teal-700 dark:text-teal-300",
    sky: "text-sky-700 dark:text-sky-300",
    amber: "text-amber-700 dark:text-amber-300",
    rose: "text-rose-700 dark:text-rose-300",
    slate: "text-slate-700 dark:text-slate-300",
    red: "text-red-700 dark:text-red-300",
  };

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-sm">
          <span className="truncate text-muted-foreground">{label}</span>
          {hint && <span className="ml-1 text-[10px] text-muted-foreground/60">· {hint}</span>}
        </div>
        <div className={`text-base font-semibold tabular-nums ${textColor[tone]}`}>{value}</div>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/60">
        <div
          className={`h-full rounded-full ${barColor[tone]} transition-all`}
          style={{ width: `${clamped}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
