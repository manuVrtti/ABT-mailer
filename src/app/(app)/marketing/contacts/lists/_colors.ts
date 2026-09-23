/**
 * Color helpers for the ContactList UI. Kept in a plain module (not the page
 * file) because Next.js pages may only export the default component plus its
 * blessed route-level exports.
 */
export function listColorChip(color: string) {
  const c = color || "emerald";
  const map: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    teal: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return map[c] ?? map.emerald!;
}

export function listColorGradient(color: string) {
  const c = color || "emerald";
  const map: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-500",
    teal: "from-teal-500 to-cyan-500",
    sky: "from-sky-500 to-blue-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
    violet: "from-violet-500 to-purple-500",
    slate: "from-slate-500 to-slate-600",
  };
  return map[c] ?? map.emerald!;
}
