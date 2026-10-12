"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { clearBrandCache, domainOf } from "@/server/brands";
import { checkDomainInSes } from "@/server/brands/ses-check";

export type SenderActionResult = { ok: true; message?: string } | { ok: false; error: string };

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const brandSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/, "Key: 2–30 lowercase letters, digits or dashes"),
    name: z.string().trim().min(1).max(60),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Domain like klymb.ai"),
    fromName: z.string().trim().min(1).max(120),
    fromAddresses: z
      .string()
      .transform((s) => s.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.string().email()).min(1, "Add at least one From address")),
    replyTo: z.preprocess(emptyToUndefined, z.string().trim().email().optional()),
    websiteUrl: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
  })
  .refine((b) => b.fromAddresses.every((a) => domainOf(a) === b.domain), {
    message: "Every From address must be on the brand's domain",
    path: ["fromAddresses"],
  });

function done(message?: string): SenderActionResult {
  clearBrandCache();
  revalidatePath("/settings/senders");
  revalidatePath("/settings");
  return { ok: true, message };
}

export async function saveBrand(formData: FormData): Promise<SenderActionResult> {
  const user = await requireRole([Role.ADMIN]);
  const parsed = brandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { id, ...data } = parsed.data;

  try {
    if (id) {
      const existing = await db.brand.findUnique({ where: { id }, select: { domain: true } });
      if (!existing) return { ok: false, error: "Sender not found." };
      // The key is referenced by suppressions and unsubscribe links: never changes.
      const { key: _key, ...editable } = data;
      await db.brand.update({
        where: { id },
        data: {
          ...editable,
          replyTo: editable.replyTo ?? null,
          websiteUrl: editable.websiteUrl ?? null,
          // A new domain has to be checked again before it can send.
          ...(existing.domain !== data.domain ? { sesVerified: false, sesStatus: null, sesCheckedAt: null } : {}),
        },
      });
    } else {
      const isFirst = (await db.brand.count()) === 0;
      await db.brand.create({ data: { ...data, isDefault: isFirst } });
    }
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { ok: false, error: "A sender with that key or domain already exists." };
    }
    throw err;
  }
  await db.auditLog.create({
    data: { userId: user.id, action: id ? "brand.update" : "brand.create", resource: `brand:${data.key}`, result: "success" },
  });
  return done("Saved.");
}

export async function checkBrandInSes(id: string): Promise<SenderActionResult> {
  await requireRole([Role.ADMIN]);
  const brand = await db.brand.findUnique({ where: { id }, select: { domain: true } });
  if (!brand) return { ok: false, error: "Sender not found." };
  const check = await checkDomainInSes(brand.domain);
  await db.brand.update({
    where: { id },
    data: { sesVerified: check.ok, sesStatus: check.status, sesCheckedAt: new Date() },
  });
  done();
  return check.ok ? { ok: true, message: check.status } : { ok: false, error: check.status };
}

export async function makeDefaultBrand(id: string): Promise<SenderActionResult> {
  const user = await requireRole([Role.ADMIN]);
  await db.$transaction([
    db.brand.updateMany({ where: { NOT: { id } }, data: { isDefault: false } }),
    db.brand.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await db.auditLog.create({ data: { userId: user.id, action: "brand.make_default", resource: `brand:${id}`, result: "success" } });
  return done("Default sender changed.");
}

export async function deleteBrand(id: string): Promise<SenderActionResult> {
  const user = await requireRole([Role.ADMIN]);
  const brand = await db.brand.findUnique({ where: { id }, select: { isDefault: true, key: true } });
  if (!brand) return { ok: false, error: "Sender not found." };
  if (brand.isDefault) return { ok: false, error: "Make another sender the default first." };
  await db.brand.delete({ where: { id } });
  await db.auditLog.create({ data: { userId: user.id, action: "brand.delete", resource: `brand:${brand.key}`, result: "success" } });
  return done("Deleted.");
}
