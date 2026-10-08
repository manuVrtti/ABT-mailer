import { LOG_EVENT_LABEL, type LogEvent } from "@/server/logs/query";

const PILL: Record<LogEvent, string> = {
  sent: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  delivered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  opened: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  clicked: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  bounced: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  complained: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  rejected: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  skipped: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

export function EventPill({ event, label }: { event: LogEvent; label?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PILL[event]}`}>
      {label ?? LOG_EVENT_LABEL[event]}
    </span>
  );
}

/** "08 Oct 2026, 04:55 pm" in IST. */
export function fmtIst(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
