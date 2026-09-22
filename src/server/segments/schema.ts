import { z } from "zod";

/**
 * Segment rule schema. Kept intentionally small — a flat list of conditions
 * combined with AND or OR. Enough to express "College=ABES AND Year=4th AND
 * RegistrationStatus=Not Registered" without introducing a nested-group UI.
 */

export const FIELD_META = {
  college: { label: "College", type: "string" },
  branch: { label: "Branch", type: "string" },
  year: { label: "Year", type: "string" },
  graduationYear: { label: "Graduation year", type: "number" },
  registrationStatus: { label: "Registration status", type: "string" },
  source: { label: "Source", type: "enum", options: ["IMPORT", "MANUAL", "API", "ABTALKS_USER"] },
  consentStatus: {
    label: "Consent status",
    type: "enum",
    options: ["UNKNOWN", "IMPLIED", "EXPLICIT", "WITHDRAWN"],
  },
  createdAt: { label: "Created at", type: "date" },
} as const;

export type FieldName = keyof typeof FIELD_META;

export const OPERATORS = [
  "eq",
  "ne",
  "contains",
  "startsWith",
  "in",
  "notIn",
  "isNull",
  "isNotNull",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const conditionSchema = z.object({
  field: z.enum(Object.keys(FIELD_META) as [FieldName, ...FieldName[]]),
  op: z.enum(OPERATORS),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.null()]).optional(),
});
export type Condition = z.infer<typeof conditionSchema>;

/**
 * A subgroup nested inside the top-level tree. One level deep — deeper
 * nesting is possible in the schema (the compiler recurses) but the UI
 * exposes only one level to keep the builder legible.
 */
export const subGroupSchema = z.object({
  combinator: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema).min(1),
});
export type SubGroup = z.infer<typeof subGroupSchema>;

/** A node in the top-level tree is either a plain condition or a subgroup. */
export const nodeSchema = z.union([conditionSchema, subGroupSchema]);
export type Node = z.infer<typeof nodeSchema>;

export const ruleTreeSchema = z.object({
  combinator: z.enum(["AND", "OR"]),
  conditions: z.array(nodeSchema).min(1),
});
export type RuleTree = z.infer<typeof ruleTreeSchema>;

export function isSubGroup(n: Node): n is SubGroup {
  return typeof n === "object" && n !== null && "combinator" in n && "conditions" in n;
}
