import { z } from "zod";

/**
 * The audience filter stored on a Klymb (live) contact list.
 *
 * Shape, read top to bottom:
 *   1. `sources`  — who to start from. A person matching ANY source is in.
 *   2. `exclude`  — sources whose people are taken out ("but NOT registered
 *                   for next week's workshop").
 *   3. the narrowing fields — every one that is set must match (AND).
 *   4. `consent`  — Klymb newsletter opt-outs are always removed; "only
 *                   opted-in" additionally requires an active subscription.
 *
 * Compiled to read-only SQL in ./sql.ts. Never trust a stored filter without
 * parsing it through `klymbFilterSchema` first.
 */

export const USER_TYPES = ["STUDENT", "PROFESSIONAL", "RECRUITER", "UNKNOWN"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  STUDENT: "Students",
  PROFESSIONAL: "Professionals",
  RECRUITER: "Recruiters",
  UNKNOWN: "Unknown",
};

export const COHORT_STATUSES = ["APPLIED", "WAITLISTED", "ACTIVE", "COMPLETED", "DROPPED", "REMOVED"] as const;

const ids = z.array(z.string().min(1).max(200)).max(200).default([]);
const submitted = z.enum(["any", "yes", "no"]).default("any");

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all_users") }),
  z.object({
    kind: z.literal("hackathon"),
    /** Empty = any hackathon. */
    eventIds: ids,
    submitted,
    leadersOnly: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("videothon"),
    eventIds: ids,
    submitted,
    employment: z.enum(["any", "LEARNER", "WORKING"]).default("any"),
  }),
  z.object({ kind: z.literal("workshop"), eventIds: ids }),
  z.object({
    kind: z.literal("cohort"),
    cohortIds: ids,
    /** Empty = any status. */
    statuses: z.array(z.enum(COHORT_STATUSES)).default([]),
  }),
  z.object({ kind: z.literal("newsletter") }),
  z.object({ kind: z.literal("mock_interview") }),
  z.object({ kind: z.literal("job_applicants") }),
]);
export type KlymbSource = z.infer<typeof sourceSchema>;
export type SourceKind = KlymbSource["kind"];

const terms = z.array(z.string().trim().min(1).max(120)).max(100).default([]);
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

export const klymbFilterSchema = z.object({
  sources: z.array(sourceSchema).min(1, "Pick at least one group to start from").max(20),
  exclude: z.array(sourceSchema).max(20).default([]),
  /** Empty = every type. */
  userTypes: z.array(z.enum(USER_TYPES)).default([]),
  /** Case-insensitive "contains" matches. */
  colleges: z.object({ include: terms, exclude: terms }).default({}),
  companies: z.object({ include: terms, exclude: terms }).default({}),
  cities: terms,
  graduationYears: z.array(z.number().int().min(1950).max(2100)).max(100).default([]),
  signedUpFrom: optionalDate,
  signedUpTo: optionalDate,
  utmSources: terms,
  utmCampaigns: terms,
  openToWork: z.boolean().default(false),
  consent: z.enum(["exclude_opted_out", "only_opted_in"]).default("exclude_opted_out"),
});
export type KlymbFilter = z.infer<typeof klymbFilterSchema>;

export function defaultKlymbFilter(): KlymbFilter {
  return klymbFilterSchema.parse({ sources: [{ kind: "all_users" }] });
}

export const SOURCE_LABELS: Record<SourceKind, string> = {
  all_users: "All Klymb users",
  hackathon: "Hackathon participants",
  videothon: "VideoThon participants",
  workshop: "Workshop registrants",
  cohort: "Cohort / program members",
  newsletter: "Newsletter subscribers",
  mock_interview: "Took a mock interview",
  job_applicants: "Applied to a job",
};

/** Event / cohort id → readable name. Cohort ids are opaque, so pass their names in `names`. */
export function eventName(id: string, names: Record<string, string> = {}): string {
  return names[id] ?? (id === "legacy" ? "First hackathon" : prettyEventId(id));
}

/** [2026, 2027, 2028, 2030] → "2026–2028, 2030". */
export function formatYears(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j]! + 1) j++;
    parts.push(j > i ? `${ys[i]}–${ys[j]}` : `${ys[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** One line per rule, in plain words, for list pages and audit logs. */
export function describeKlymbFilter(f: KlymbFilter, names: Record<string, string> = {}): string[] {
  const out: string[] = [];
  const src = (s: KlymbSource) => describeSource(s, names);
  out.push(`Anyone who is: ${f.sources.map(src).join(", OR ")}`);
  for (const s of f.exclude) out.push(`Except: ${src(s)}`);
  if (f.userTypes.length > 0) out.push(`Only: ${f.userTypes.map((t) => USER_TYPE_LABELS[t]).join(", ")}`);
  if (f.colleges.include.length) out.push(`College contains: ${f.colleges.include.join(", ")}`);
  if (f.colleges.exclude.length) out.push(`College does not contain: ${f.colleges.exclude.join(", ")}`);
  if (f.companies.include.length) out.push(`Company contains: ${f.companies.include.join(", ")}`);
  if (f.companies.exclude.length) out.push(`Company does not contain: ${f.companies.exclude.join(", ")}`);
  if (f.cities.length) out.push(`City / state contains: ${f.cities.join(", ")}`);
  if (f.graduationYears.length) out.push(`Graduation year: ${formatYears(f.graduationYears)}`);
  if (f.signedUpFrom || f.signedUpTo) {
    out.push(`Signed up ${f.signedUpFrom ? `from ${f.signedUpFrom}` : ""}${f.signedUpFrom && f.signedUpTo ? " " : ""}${f.signedUpTo ? `to ${f.signedUpTo}` : ""}`);
  }
  if (f.utmSources.length) out.push(`UTM source: ${f.utmSources.join(", ")}`);
  if (f.utmCampaigns.length) out.push(`UTM campaign: ${f.utmCampaigns.join(", ")}`);
  if (f.openToWork) out.push("Open to work");
  out.push(f.consent === "only_opted_in" ? "Only newsletter opted-in" : "Newsletter opt-outs removed");
  return out;
}

function describeSource(s: KlymbSource, names: Record<string, string>): string {
  const label = SOURCE_LABELS[s.kind];
  const which = (ids: string[]) => (ids.length ? `(${ids.map((id) => eventName(id, names)).join(", ")})` : "(any)");
  switch (s.kind) {
    case "hackathon":
      return [
        label,
        which(s.eventIds),
        s.submitted === "yes" ? "who submitted" : s.submitted === "no" ? "who did NOT submit" : "",
        s.leadersOnly ? "— team leaders only" : "",
      ].filter(Boolean).join(" ");
    case "videothon":
      return [
        label,
        which(s.eventIds),
        s.employment !== "any" ? `— ${s.employment === "WORKING" ? "working" : "learners"}` : "",
        s.submitted === "yes" ? "who submitted" : s.submitted === "no" ? "who did NOT submit" : "",
      ].filter(Boolean).join(" ");
    case "workshop":
      return `${label} ${which(s.eventIds)}`;
    case "cohort":
      return [
        label,
        s.cohortIds.every((id) => names[id]) ? which(s.cohortIds) : `(${s.cohortIds.length} selected)`,
        s.statuses.length ? `— ${s.statuses.join("/").toLowerCase()}` : "",
      ].filter(Boolean).join(" ");
    default:
      return label;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS: Record<string, string> = { ai: "AI", linkedin: "LinkedIn", ml: "ML", ui: "UI", ux: "UX" };

/**
 * A readable name for an event id: "workshop-2026-09-05" → "Workshop · 5 Sep 2026",
 * "linkedin-ai-interview" → "LinkedIn AI Interview".
 */
export function prettyEventId(id: string): string {
  const dated = id.match(/^(.*?)-?(\d{4})-(\d{2})-(\d{2})$/);
  if (dated) {
    const [, prefix, y, m, d] = dated;
    const date = `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
    return prefix ? `${prettyEventId(prefix)} · ${date}` : date;
  }
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => WORDS[w.toLowerCase()] ?? w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
