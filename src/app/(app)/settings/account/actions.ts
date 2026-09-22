"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, "New password must be at least 10 characters").max(200),
});

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changeMyPassword(formData: FormData): Promise<ChangePasswordResult> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const row = await db.user.findUnique({ where: { id: user.id }, select: { hashedPassword: true } });
  if (!row) return { ok: false, error: "Account not found" };
  const currentMatches = await bcrypt.compare(parsed.data.currentPassword, row.hashedPassword);
  if (!currentMatches) return { ok: false, error: "Current password is incorrect" };

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return { ok: false, error: "New password must be different from current" };
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { hashedPassword: hashed } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "user.change_password_self",
      resource: `user:${user.id}`,
      result: "success",
    },
  });
  revalidatePath("/settings/account");
  return { ok: true };
}
