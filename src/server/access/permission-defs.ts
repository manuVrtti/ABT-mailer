/**
 * Role permissions — definitions only (client-safe, no server imports).
 *
 * Admins can always do everything. Marketers and viewers get the permissions
 * an admin ticks in Settings → Roles & permissions; until then the defaults
 * below apply.
 *
 * A ticked section (campaigns, templates, …) means the person can open it —
 * it shows in their sidebar, dashboard and search. Marketers can also create,
 * edit and send there; viewers are always read-only. An unticked section is
 * hidden everywhere and its pages answer 403.
 *
 * Settings (other than "Your account") and the delete actions for templates,
 * segments and logs stay admin-only.
 */

export const PERMISSIONS = [
  { key: "campaigns.manage", label: "Campaigns", hint: "See campaigns and their reports. Marketers can also create, edit and send them." },
  { key: "personal.manage", label: "Customize mail", hint: "See bulk CSV mails and single emails. Marketers can also write and send them." },
  { key: "contacts.manage", label: "Contacts, lists & segments", hint: "See contacts, lists and segments. Marketers can also import and edit them." },
  { key: "templates.manage", label: "Templates", hint: "See marketing templates. Marketers can also create and edit them." },
  { key: "transactional.manage", label: "Transactional templates & events", hint: "See transactional templates and event rules. Marketers can also edit them." },
  { key: "logs.view", label: "Logs & real time", hint: "Email logs, log details and the Real time view." },
  { key: "logs.manage", label: "Resend emails from logs", hint: "Send a logged email again. Marketers only." },
  { key: "analytics.view", label: "Analytics", hint: "Dashboard numbers, email performance, conversions and transactional analytics." },
  { key: "exports", label: "Download CSV exports", hint: "Campaign activity, conversions, personal-mail reports and logs." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as Permission[];

/** Permissions that let someone change or send things — never granted to viewers. */
export const EDIT_PERMISSIONS: Permission[] = [
  "campaigns.manage",
  "personal.manage",
  "contacts.manage",
  "templates.manage",
  "transactional.manage",
  "logs.manage",
];

/** Viewers can't hold these at all (there is nothing to see, only to do). */
export const MARKETER_ONLY: Permission[] = ["logs.manage"];

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
  VIEWER: [
    "campaigns.manage",
    "personal.manage",
    "contacts.manage",
    "templates.manage",
    "transactional.manage",
    "logs.view",
    "analytics.view",
    "exports",
  ],
};

/** What the role may open (ticked boxes). Admins: everything. */
export function effectiveAccess(role: string, stored: string[] | null | undefined): Set<Permission> {
  if (role === "ADMIN") return new Set(PERMISSION_KEYS);
  const base = stored ?? DEFAULT_PERMISSIONS[role as ConfigurableRole] ?? [];
  return new Set(
    base.filter(
      (p): p is Permission =>
        (PERMISSION_KEYS as string[]).includes(p) && !(role === "VIEWER" && (MARKETER_ONLY as string[]).includes(p)),
    ),
  );
}

/** What the role may do: its access, minus every edit permission for viewers. */
export function effectivePermissions(role: string, stored: string[] | null | undefined): Set<Permission> {
  const access = effectiveAccess(role, stored);
  if (role !== "VIEWER") return access;
  return new Set([...access].filter((p) => !EDIT_PERMISSIONS.includes(p)));
}
