"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { listBrands } from "@/server/brands";

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum([Role.ADMIN, Role.MARKETER, Role.VIEWER]),
  password: z.string().min(10).max(200),
});

export async function createUser(formData: FormData) {
  const admin = await requireRole([Role.ADMIN]);
  const parsed = createSchema.parse({
    email: String(formData.get("email") ?? "").toLowerCase(),
    name: formData.get("name"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  const access = await readSenderAccess(
    formData.get("allSenders") === "on",
    formData.getAll("brandKeys").map(String),
  );
  const hashed = await bcrypt.hash(parsed.password, 12);
  const user = await db.user.create({
    data: { email: parsed.email, name: parsed.name, role: parsed.role, hashedPassword: hashed, ...access },
  });
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: "user.create",
      resource: `user:${user.id}`,
      metadata: { email: parsed.email, role: parsed.role, ...access },
      result: "success",
    },
  });
  revalidatePath("/settings/users");
}

export async function setUserRole(id: string, role: Role) {
  const admin = await requireRole([Role.ADMIN]);
  await db.user.update({ where: { id }, data: { role } });
  await db.auditLog.create({
    data: { userId: admin.id, action: "user.set_role", resource: `user:${id}`, metadata: { role }, result: "success" },
  });
  revalidatePath("/settings/users");
}

export async function toggleUserActive(id: string, isActive: boolean) {
  const admin = await requireRole([Role.ADMIN]);
  if (id === admin.id && !isActive) throw new Error("You can't deactivate yourself");
  await db.user.update({ where: { id }, data: { isActive } });
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: isActive ? "user.activate" : "user.deactivate",
      resource: `user:${id}`,
      result: "success",
    },
  });
  revalidatePath("/settings/users");
}

export async function resetUserPassword(id: string, newPassword: string) {
  const admin = await requireRole([Role.ADMIN]);
  if (newPassword.length < 10) throw new Error("Password must be at least 10 characters");
  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id }, data: { hashedPassword: hashed } });
  await db.auditLog.create({
    data: { userId: admin.id, action: "user.reset_password", resource: `user:${id}`, result: "success" },
  });
  revalidatePath("/settings/users");
}

/** Validated sender access: every sender, or a list of existing brand keys. */
async function readSenderAccess(allSenders: boolean, brandKeys: string[]) {
  if (allSenders) return { allSenders: true, senderBrandKeys: [] as string[] };
  const known = new Set((await listBrands()).map((b) => b.key));
  return { allSenders: false, senderBrandKeys: Array.from(new Set(brandKeys.filter((k) => known.has(k)))) };
}

export async function setUserSenderAccess(
  id: string,
  allSenders: boolean,
  brandKeys: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireRole([Role.ADMIN]);
  const access = await readSenderAccess(allSenders, brandKeys);
  if (!access.allSenders && access.senderBrandKeys.length === 0) {
    return { ok: false, error: "Pick at least one sender, or All senders." };
  }
  await db.user.update({ where: { id }, data: access });
  await db.auditLog.create({
    data: { userId: admin.id, action: "user.set_sender_access", resource: `user:${id}`, metadata: access, result: "success" },
  });
  revalidatePath("/settings/users");
  return { ok: true };
}
