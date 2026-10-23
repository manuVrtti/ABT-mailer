import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { effectiveAccess, effectivePermissions, type Permission } from "./permission-defs";

export * from "./permission-defs";

/**
 * Stored permission lists by role, read once per request. Not cached across
 * requests: a module-level cache would differ per server instance (and per
 * bundle), so a saved change could take a while to reach every page.
 */
const storedPermissions = cache(async (): Promise<Map<string, string[]>> => {
  const rows = await db.rolePermission.findMany();
  return new Map(rows.map((r) => [r.role as string, r.permissions]));
});

/** What the role may do (create, edit, send, export…). Viewers never get edit permissions. */
export async function permissionsForRole(role: Role): Promise<Set<Permission>> {
  return effectivePermissions(role, (await storedPermissions()).get(role) ?? null);
}

/** Sections the role may open — the boxes ticked in Roles & permissions. */
export async function accessForRole(role: Role): Promise<Set<Permission>> {
  return effectiveAccess(role, (await storedPermissions()).get(role) ?? null);
}

/** The signed-in person's permissions (what they may do). Cached per request. */
export const currentPermissions = cache(async (): Promise<Set<Permission>> => {
  const user = await requireUser();
  return permissionsForRole(user.role);
});

/** Sections the signed-in person may open. Cached per request. */
export const currentAccess = cache(async (): Promise<Set<Permission>> => {
  const user = await requireUser();
  return accessForRole(user.role);
});

/** Action / editor gate: 403 page unless the person may do `permission`. */
export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!(await permissionsForRole(user.role)).has(permission)) redirect("/403");
  return user;
}

/** Section page gate: 403 page unless the person may open `section` (read-only is enough). */
export async function requireAccess(section: Permission) {
  const user = await requireUser();
  if (!(await accessForRole(user.role)).has(section)) redirect("/403");
  return user;
}

export async function hasPermission(role: Role, permission: Permission): Promise<boolean> {
  return (await permissionsForRole(role)).has(permission);
}
