/**
 * Role permissions — definitions only (client-safe, no server imports).
 *
 * Admins can always do everything. Marketers and viewers get the permissions
 * an admin ticks in Settings → Roles & permissions; until then the defaults
 * below apply, which reproduce how the app behaved before the grid existed.
 *
 * Settings (users, senders, suppressions, audit log, permissions) and the
 * delete actions for templates, segments and logs stay admin-only.
 */

export const PERMISSIONS = [
  { key: "campaigns.manage", label: "Send & edit campaigns", hint: "Create, edit, test, send, schedule, pause and cancel campaigns." },
  { key: "personal.manage", label: "Personal mails", hint: "Upload and send personal-mail batches." },
  { key: "contacts.manage", label: "Manage contacts", hint: "Import contacts; create and edit lists, Klymb lists and segments." },
  { key: "templates.manage", label: "Create & edit templates", hint: "Marketing templates." },
  { key: "transactional.manage", label: "Transactional settings", hint: "Transactional templates and event rules." },
  { key: "logs.view", label: "View logs", hint: "Logs, log details and Real time." },
  { key: "logs.manage", label: "Resend emails from logs", hint: "Send a logged email again." },
  { key: "analytics.view", label: "View analytics", hint: "Email performance, conversions and transactional analytics." },
  { key: "exports", label: "Download CSV exports", hint: "Campaign activity, conversions, personal-mail reports and logs." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

export type ConfigurableRole = "MARKETER" | "VIEWER";

export const DEFAULT_PERMISSIONS: Record<ConfigurableRole, Permission[]> = {
  MARKETER: [
    "campaigns.manage",
    "personal.manage",
    "contacts.manage",
    "templates.manage",
    "logs.view",
    "logs.manage",
    "analytics.view",
    "exports",
  ],
  VIEWER: ["logs.view", "analytics.view", "exports"],
};

/** Stored list (or none) → the role's effective permissions. Admins: everything. */
export function effectivePermissions(role: string, stored: string[] | null | undefined): Set<Permission> {
  if (role === "ADMIN") return new Set(PERMISSION_KEYS);
  const base = stored ?? DEFAULT_PERMISSIONS[role as ConfigurableRole] ?? [];
  return new Set(base.filter((p): p is Permission => (PERMISSION_KEYS as string[]).includes(p)));
}
