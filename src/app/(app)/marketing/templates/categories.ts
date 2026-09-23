/**
 * Marketing template categories. Kept in a plain module (NOT the "use server"
 * actions file) so it can be re-exported to client components. Server actions
 * files may only export async functions — exporting a constant array from one
 * makes Next.js proxy it as a function reference, which then blows up with
 * "x.map is not a function" the first time the client tries to iterate it.
 */
export const MARKETING_TEMPLATE_CATEGORIES = [
  "Placement Drive",
  "Workshop",
  "Hackathon",
  "Cohort",
  "Newsletter",
  "Announcement",
  "Reminder",
  "Welcome",
  "Custom",
] as const;

export type MarketingTemplateCategory = (typeof MARKETING_TEMPLATE_CATEGORIES)[number];
