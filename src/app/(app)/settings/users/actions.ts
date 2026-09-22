"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";

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
  const hashed = await bcrypt.hash(parsed.password, 12);
  const user = await db.user.create({
    data: { email: parsed.email, name: parsed.name, role: parsed.role, hashedPassword: hashed },
  });
  await db.auditLog.create({
    data: {
      userId: admin.id,
      action: "user.create",
      resource: `user:${user.id}`,
      metadata: { email: parsed.email, role: parsed.role },
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
