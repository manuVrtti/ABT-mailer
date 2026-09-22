"use server";

import { revalidatePath } from "next/cache";
import { EmailCategory, Role, SuppressionReason } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { addSuppression } from "@/server/email/suppression";
import { normalizeEmail } from "@/lib/utils";

export async function addManualSuppression(formData: FormData) {
  const user = await requireRole([Role.ADMIN]);
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const category = String(formData.get("category") ?? "") as EmailCategory;
  const note = String(formData.get("note") ?? "") || undefined;
  if (!email) throw new Error("Email is required");
  if (!Object.values(EmailCategory).includes(category)) throw new Error("Invalid category");
  await addSuppression(email, category, SuppressionReason.MANUAL, note);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "suppression.add",
      resource: `email:${email}`,
      metadata: { category, note: note ?? null },
      result: "success",
    },
  });
  revalidatePath("/settings/suppressions");
}

export async function removeSuppression(id: string) {
  const user = await requireRole([Role.ADMIN]);
  const row = await db.suppression.findUnique({ where: { id } });
  if (!row) return;
  await db.suppression.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "suppression.remove",
      resource: `email:${row.email}`,
      metadata: { category: row.category, reason: row.reason },
      result: "success",
    },
  });
  revalidatePath("/settings/suppressions");
}
