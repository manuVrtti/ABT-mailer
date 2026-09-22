"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role, EmailCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { extractVariables } from "@/server/email/render";
import { EmailService } from "@/server/email";

const templateSchema = z.object({
  templateKey: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, "lowercase snake_case only"),
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(300),
  html: z.string().min(1),
  text: z.string().optional(),
  category: z.enum(["TRANSACTIONAL_NONESSENTIAL", "TRANSACTIONAL_ESSENTIAL"]),
});

/**
 * Creates a NEW version of a transactional template. If the templateKey already
 * exists, we bump the version and (optionally) activate. Versions are immutable
 * once created — safer for audit than in-place edits.
 */
export async function saveTransactionalTemplate(formData: FormData) {
  const user = await requireRole([Role.ADMIN]);
  const parsed = templateSchema.parse({
    templateKey: formData.get("templateKey"),
    name: formData.get("name"),
    subject: formData.get("subject"),
    html: formData.get("html"),
    text: formData.get("text") || undefined,
    category: formData.get("category"),
  });
  const activate = formData.get("activate") === "on";

  // Union of variables from subject/html/text.
  const variables = Array.from(
    new Set([...extractVariables(parsed.subject), ...extractVariables(parsed.html), ...extractVariables(parsed.text ?? "")]),
  );

  const existing = await db.transactionalTemplate.findFirst({
    where: { templateKey: parsed.templateKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (existing?.version ?? 0) + 1;

  await db.$transaction(async (tx) => {
    if (activate) {
      // Only one active version per templateKey.
      await tx.transactionalTemplate.updateMany({
        where: { templateKey: parsed.templateKey, isActive: true },
        data: { isActive: false },
      });
    }
    await tx.transactionalTemplate.create({
      data: {
        templateKey: parsed.templateKey,
        version,
        name: parsed.name,
        subject: parsed.subject,
        html: parsed.html,
        text: parsed.text,
        variables,
        category: parsed.category as EmailCategory,
        isActive: activate,
        createdById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "transactional_template.save",
        resource: `template:${parsed.templateKey}:v${version}`,
        result: "success",
      },
    });
  });

  revalidatePath("/transactional/templates");
  redirect(`/transactional/templates/${encodeURIComponent(parsed.templateKey)}`);
}

export async function activateTransactionalVersion(templateKey: string, version: number) {
  const user = await requireRole([Role.ADMIN]);
  await db.$transaction([
    db.transactionalTemplate.updateMany({ where: { templateKey, isActive: true }, data: { isActive: false } }),
    db.transactionalTemplate.update({ where: { templateKey_version: { templateKey, version } }, data: { isActive: true } }),
    db.auditLog.create({
      data: {
        userId: user.id,
        action: "transactional_template.activate",
        resource: `template:${templateKey}:v${version}`,
        result: "success",
      },
    }),
  ]);
  revalidatePath(`/transactional/templates/${encodeURIComponent(templateKey)}`);
}

export async function sendTestTransactional(formData: FormData) {
  await requireRole([Role.ADMIN]);
  const to = String(formData.get("to") ?? "");
  const templateKey = String(formData.get("templateKey") ?? "");
  const varsRaw = String(formData.get("variables") ?? "{}");

  if (!to || !templateKey) return { ok: false, error: "to and templateKey are required" };
  const template = await db.transactionalTemplate.findFirst({
    where: { templateKey, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!template) return { ok: false, error: `no active template for ${templateKey}` };

  let variables: Record<string, string | number | null> = {};
  try {
    variables = JSON.parse(varsRaw);
  } catch {
    return { ok: false, error: "variables must be valid JSON" };
  }

  const { renderTemplate } = await import("@/server/email/render");
  try {
    const subject = renderTemplate(template.subject, variables, { strict: true });
    const html = renderTemplate(template.html, variables, { strict: true, sanitize: true });
    const text = template.text ? renderTemplate(template.text, variables, { strict: true }) : undefined;
    const res = await EmailService.sendTest({ to, subject, html, text });
    return { ok: true, providerMessageId: res.providerMessageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const ruleSchema = z.object({
  eventType: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/, "UPPER_SNAKE_CASE only"),
  templateKey: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  requiredVars: z.string().optional(),
  isActive: z.string().optional(),
});

export async function saveEventRule(formData: FormData) {
  const user = await requireRole([Role.ADMIN]);
  const parsed = ruleSchema.parse({
    eventType: formData.get("eventType"),
    templateKey: formData.get("templateKey"),
    description: formData.get("description") || undefined,
    requiredVars: formData.get("requiredVars") || undefined,
    isActive: formData.get("isActive") ?? undefined,
  });
  const requiredVars = (parsed.requiredVars ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isActive = parsed.isActive === "on";

  await db.emailEventRule.upsert({
    where: { eventType: parsed.eventType },
    update: {
      templateKey: parsed.templateKey,
      description: parsed.description,
      requiredVars,
      isActive,
    },
    create: {
      eventType: parsed.eventType,
      templateKey: parsed.templateKey,
      description: parsed.description,
      requiredVars,
      isActive,
    },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "event_rule.save",
      resource: `rule:${parsed.eventType}`,
      metadata: { templateKey: parsed.templateKey, isActive },
      result: "success",
    },
  });
  revalidatePath("/transactional/events");
  redirect("/transactional/events");
}

export async function toggleEventRule(eventType: string, isActive: boolean) {
  const user = await requireRole([Role.ADMIN]);
  await db.emailEventRule.update({ where: { eventType }, data: { isActive } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "event_rule.toggle",
      resource: `rule:${eventType}`,
      metadata: { isActive },
      result: "success",
    },
  });
  revalidatePath("/transactional/events");
}
