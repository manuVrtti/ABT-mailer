"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { extractVariables } from "@/server/email/render";
import { EmailService } from "@/server/email";
import { renderTemplate } from "@/server/email/render";
import { MARKETING_TEMPLATE_CATEGORIES } from "./categories";
import { canEditTemplate, canUseTemplate, currentScope } from "@/server/access/scope";

export async function saveMarketingTemplate(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "") || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "Custom");
  const subject = String(formData.get("subject") ?? "").trim();
  const previewText = String(formData.get("previewText") ?? "").trim() || undefined;
  const designJson = String(formData.get("designJson") ?? "");
  const html = String(formData.get("html") ?? "");
  const brandKey = String(formData.get("brandKey") ?? "") || null;

  // Shared templates (no brand) are for people with every sender; others
  // keep their templates on their own brands.
  const scope = await currentScope();
  if (!scope.all && (!brandKey || !scope.brandKeys.includes(brandKey))) {
    throw new Error("Pick one of your brands for this template.");
  }
  if (brandKey && !scope.brands.some((b) => b.key === brandKey)) throw new Error("Unknown brand");
  if (id) {
    const existing = await db.emailTemplate.findUnique({ where: { id }, select: { brandKey: true } });
    if (!existing || !canEditTemplate(scope, existing)) throw new Error("You can't edit this template. Duplicate it instead.");
  }

  if (!name) throw new Error("Name is required");
  if (!subject) throw new Error("Subject is required");
  if (!html) throw new Error("Design HTML is empty — open the editor and add content");
  if (!(MARKETING_TEMPLATE_CATEGORIES as readonly string[]).includes(category))
    throw new Error("Invalid category");

  let parsedDesign: unknown;
  try {
    parsedDesign = JSON.parse(designJson);
  } catch {
    throw new Error("Design JSON is invalid");
  }

  const variables = Array.from(
    new Set([...extractVariables(subject), ...extractVariables(html)]),
  );

  const data = {
    brandKey,
    name,
    category,
    subject,
    previewText,
    designJson: parsedDesign as Prisma.InputJsonValue,
    html,
    variables,
    createdById: user.id,
  };

  const template = id
    ? await db.emailTemplate.update({ where: { id }, data })
    : await db.emailTemplate.create({ data });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: id ? "marketing_template.update" : "marketing_template.create",
      resource: `template:${template.id}`,
      metadata: { name, category },
      result: "success",
    },
  });

  revalidatePath("/marketing/templates");
  redirect(`/marketing/templates/${template.id}`);
}

export async function sendMarketingTestEmail(templateId: string, to: string) {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  if (!to || !templateId) return { ok: false, error: "template and recipient required" };
  const tpl = await db.emailTemplate.findUnique({ where: { id: templateId } });
  const scope = await currentScope();
  if (!tpl || !canUseTemplate(scope, tpl)) return { ok: false, error: "template not found" };
  // Test as the template's brand, else one of the person's own brands.
  const brand =
    scope.brands.find((b) => b.key === tpl.brandKey && b.sesVerified) ??
    (scope.all ? undefined : scope.brands.find((b) => b.sesVerified));

  // Sample variables — non-strict rendering so unset tokens survive.
  const sample = Object.fromEntries(tpl.variables.map((v) => [v, `sample_${v}`]));
  try {
    const subject = renderTemplate(tpl.subject, sample);
    const html = renderTemplate(tpl.html, sample, { sanitize: true });
    const res = await EmailService.sendTest({
      to,
      subject,
      html,
      ...(brand ? { fromEmail: brand.fromAddresses[0], fromName: brand.fromName, replyTo: brand.replyTo ?? undefined } : {}),
    });
    return { ok: true, providerMessageId: res.providerMessageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function duplicateMarketingTemplate(id: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const src = await db.emailTemplate.findUnique({ where: { id } });
  const scope = await currentScope();
  if (!src || !canUseTemplate(scope, src)) throw new Error("Template not found");
  const copy = await db.emailTemplate.create({
    data: {
      // A restricted person's copy of a shared template lands on their brand.
      brandKey: scope.all ? src.brandKey : src.brandKey ?? scope.brandKeys[0] ?? null,
      name: `${src.name} (copy)`,
      category: src.category,
      subject: src.subject,
      previewText: src.previewText,
      designJson: src.designJson as Prisma.InputJsonValue,
      html: src.html,
      variables: src.variables,
      createdById: user.id,
    },
  });
  revalidatePath("/marketing/templates");
  redirect(`/marketing/templates/${copy.id}`);
}

export async function deleteMarketingTemplate(id: string) {
  const user = await requireRole([Role.ADMIN]);
  const inUse = await db.campaign.count({ where: { templateId: id } });
  if (inUse > 0) throw new Error(`Template is used by ${inUse} campaign(s)`);
  await db.emailTemplate.delete({ where: { id } });
  await db.auditLog.create({
    data: { userId: user.id, action: "marketing_template.delete", resource: `template:${id}`, result: "success" },
  });
  revalidatePath("/marketing/templates");
  redirect("/marketing/templates");
}

