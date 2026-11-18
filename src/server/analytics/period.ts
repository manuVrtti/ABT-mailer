/**
 * Date ranges for Analytics — pure (no database), so it's easy to test.
 *
 * Everything is in India time (IST, UTC+05:30, no daylight saving). A range is
 * [from, to): `from` is the first IST midnight included, `to` the IST midnight
 * after the last day.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 3 * 366;

export const PRESETS = {
  this_week: "This week",
  this_month: "This month",
  this_year: "This year",
  last_7: "Last 7 days",
  last_30: "Last 30 days",
  last_90: "Last 90 days",
  last_month: "Last month",
  last_year: "Last year",
  custom: "Custom",
} as const;
export type Preset = keyof typeof PRESETS;

export type Grouping = "day" | "week" | "month";

export interface Period {
  preset: Preset;
  from: Date;
  to: Date;
  /** First and last IST day included, as YYYY-MM-DD. */
  fromDay: string;
  toDay: string;
  days: number;
  label: string;
}

/** IST calendar day (YYYY-MM-DD) of an instant. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of IST midnight starting `day` (YYYY-MM-DD). */
export function istMidnight(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the IST week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function addMonths(day: string, n: number): string {
  const d = new Date(`${monthStart(day)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const DAY_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fmtDay = (day: string) => DAY_FMT.format(new Date(`${day}T00:00:00Z`));

const isDay = (v: string | undefined): v is string =>
  Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

/** The range for a preset (or custom from/to), as of `now`. Bad input falls back to the last 30 days. */
export function resolvePeriod(
  input: { preset?: string; from?: string; to?: string },
  now: Date = new Date(),
): Period {
  const today = istDay(now);
  let preset: Preset = input.preset && input.preset in PRESETS ? (input.preset as Preset) : "last_30";
  let first: string;
  let last: string;
  switch (preset) {
    case "this_week":
      first = weekStart(today);
      last = today;
      break;
    case "this_month":
      first = monthStart(today);
      last = today;
      break;
    case "this_year":
      first = `${today.slice(0, 4)}-01-01`;
      last = today;
      break;
    case "last_7":
      first = addDays(today, -6);
      last = today;
      break;
    case "last_90":
      first = addDays(today, -89);
      last = today;
      break;
    case "last_month":
      first = addMonths(today, -1);
      last = addDays(monthStart(today), -1);
      break;
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      first = `${y}-01-01`;
      last = `${y}-12-31`;
      break;
    }
    case "custom": {
      if (isDay(input.from) && isDay(input.to)) {
        [first, last] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
        if (last > today) last = today;
        if (first > last) first = last;
        // Keep queries sane: at most ~3 years, counted back from the end.
        const span = Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1;
        if (span > MAX_RANGE_DAYS) first = addDays(last, -(MAX_RANGE_DAYS - 1));
        break;
      }
      preset = "last_30";
      first = addDays(today, -29);
      last = today;
      break;
    }
    default:
      first = addDays(today, -29);
      last = today;
  }
  const days = Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1;
  return {
    preset,
    from: istMidnight(first),
    to: istMidnight(addDays(last, 1)),
    fromDay: first,
    toDay: last,
    days,
    label:
      preset === "custom"
        ? `${fmtDay(first)} – ${fmtDay(last)}`
        : `${PRESETS[preset]} · ${fmtDay(first)} – ${fmtDay(last)}`,
  };
}

/** The same number of days immediately before — for ▲/▼ comparisons. */
export function previousPeriod(p: Period): { from: Date; to: Date; fromDay: string; toDay: string } {
  const toDay = addDays(p.fromDay, -1);
  const fromDay = addDays(p.fromDay, -p.days);
  return { from: istMidnight(fromDay), to: istMidnight(p.fromDay), fromDay, toDay };
}

/** Day for short ranges, week up to ~6 months, month beyond. */
export function autoGrouping(days: number): Grouping {
  if (days <= 45) return "day";
  if (days <= 190) return "week";
  return "month";
}

/** Every bucket start (YYYY-MM-DD) from the first to the last day, in order. */
export function bucketKeys(fromDay: string, toDay: string, by: Grouping): string[] {
  const keys: string[] = [];
  let k = by === "day" ? fromDay : by === "week" ? weekStart(fromDay) : monthStart(fromDay);
  while (k <= toDay) {
    keys.push(k);
    k = by === "day" ? addDays(k, 1) : by === "week" ? addDays(k, 7) : addMonths(k, 1);
  }
  return keys;
}

export function bucketOf(day: string, by: Grouping): string {
  return by === "day" ? day : by === "week" ? weekStart(day) : monthStart(day);
}

const SHORT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function bucketLabel(key: string, by: Grouping): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (by === "month") return MONTH.format(d);
  if (by === "week") return `Week of ${SHORT.format(d)}`;
  return SHORT.format(d);
}
