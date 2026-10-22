"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { PERMISSION_KEYS, type Permission } from "@/server/access/permissions";

export type SavePermissionsResult = { ok: true } | { ok: false; error: string };

/** Admin only: what marketers and viewers may do. */
export async function saveRolePermissions(
  input: Record<"MARKETER" | "VIEWER", string[]>,
): Promise<SavePermissionsResult> {
  const admin = await requireRole([Role.ADMIN]);
  const clean = (list: string[]) =>
    Array.from(new Set(list.filter((p): p is Permission => (PERMISSION_KEYS as string[]).includes(p))));
  const next = { MARKETER: clean(input.MARKETER ?? []), VIEWER: clean(input.VIEWER ?? []) };
  for (const role of [Role.MARKETER, Role.VIEWER] as const) {
    await db.rolePermission.upsert({
      where: { role },
      create: { role, permissions: next[role], updatedById: admin.id },
      update: { permissions: next[role], updatedById: admin.id },
    });
  }
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: "roles.set_permissions",
      resource: "roles",
      metadata: next,
      result: "success",
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
