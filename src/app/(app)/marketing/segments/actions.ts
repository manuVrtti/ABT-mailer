"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { ruleTreeSchema, type RuleTree } from "@/server/segments/schema";
import { computeAudience } from "@/server/segments/compile";

export async function saveSegment(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "") || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const rulesJson = String(formData.get("rules") ?? "");
  if (!name) throw new Error("Name is required");
  const rules = ruleTreeSchema.parse(JSON.parse(rulesJson));

  const preview = await computeAudience(rules);

  const data = {
    name,
    description,
    rules: rules as unknown as Prisma.InputJsonValue,
    audienceSize: preview.final,
    computedAt: new Date(),
  };

  const segment = id
    ? await db.segment.update({ where: { id }, data })
    : await db.segment.create({ data });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: id ? "segment.update" : "segment.create",
      resource: `segment:${segment.id}`,
      metadata: { name, final: preview.final },
      result: "success",
    },
  });

  revalidatePath("/marketing/segments");
  redirect(`/marketing/segments/${segment.id}`);
}

export async function previewAudience(rulesJson: string): Promise<
  { ok: true; matching: number; suppressed: number; final: number } | { ok: false; error: string }
> {
  await requireRole([Role.ADMIN, Role.MARKETER, Role.VIEWER]);
  try {
    const rules = ruleTreeSchema.parse(JSON.parse(rulesJson)) as RuleTree;
    const res = await computeAudience(rules);
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function deleteSegment(id: string) {
  const user = await requireRole([Role.ADMIN]);
  await db.segment.delete({ where: { id } });
  await db.auditLog.create({
    data: { userId: user.id, action: "segment.delete", resource: `segment:${id}`, result: "success" },
  });
  revalidatePath("/marketing/segments");
  redirect("/marketing/segments");
}
