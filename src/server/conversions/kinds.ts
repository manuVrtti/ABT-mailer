import { z } from "zod";

/**
 * Conversion = something a person did in Klymb after getting an email.
 * Client-safe (no server imports): used by the goal picker too.
 */
export const CONVERSION_KINDS = ["SIGNUP", "WORKSHOP", "HACKATHON", "VIDEOTHON", "SUBMISSION", "COHORT", "JOB", "MOCK_INTERVIEW"] as const;
export type ConversionKind = (typeof CONVERSION_KINDS)[number];

export const KIND_LABELS: Record<ConversionKind, string> = {
  SIGNUP: "Signed up",
  WORKSHOP: "Workshop registration",
  HACKATHON: "Hackathon registration",
  VIDEOTHON: "VideoThon registration",
  SUBMISSION: "Hackathon / VideoThon submission",
  COHORT: "Cohort enrollment",
  JOB: "Job application",
  MOCK_INTERVIEW: "Mock interview",
};

/** Kinds whose actions are about a specific event / cohort a goal can pin. */
export const KINDS_WITH_REF: ConversionKind[] = ["WORKSHOP", "HACKATHON", "VIDEOTHON", "SUBMISSION", "COHORT"];

/** A campaign's goal. `ref` narrows it to one event or cohort; absent = any of that kind. */
export const goalSchema = z.object({
  kind: z.enum(CONVERSION_KINDS),
  ref: z.string().min(1).max(200).optional(),
  label: z.string().max(300).optional(),
});
export type ConversionGoal = z.infer<typeof goalSchema>;

export function parseGoal(raw: unknown): ConversionGoal | null {
  const r = goalSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function goalMatches(goal: ConversionGoal | null, c: { kind: string; ref: string | null }): boolean {
  if (!goal) return false;
  return c.kind === goal.kind && (!goal.ref || goal.ref === c.ref);
}

export function describeGoal(goal: ConversionGoal | null): string {
  if (!goal) return "Any action";
  return goal.label ?? (goal.ref ? `${KIND_LABELS[goal.kind]} · ${goal.ref}` : KIND_LABELS[goal.kind]);
}

/** Days after an email during which an action is credited to it. */
export const ATTRIBUTION_WINDOW_DAYS = 7;
