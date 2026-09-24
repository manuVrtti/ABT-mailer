"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CampaignStatus, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { computeAudience } from "@/server/segments/compile";
import { ruleTreeSchema } from "@/server/segments/schema";
import { renderTemplate } from "@/server/email/render";
import { EmailService } from "@/server/email";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80) || `campaign-${Date.now().toString(36)}`
  );
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base;
  for (let i = 1; i < 20; i++) {
    const existing = await db.campaign.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${i + 1}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Step 1 (Setup): create the DRAFT with just sender + name.
const setupSchema = z.object({
  name: z.string().min(1).max(200),
  fromName: z.string().min(1).max(120),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional(),
  // Optional preselected audience from ?listId=/?segmentId=.
  initialAudience: z
    .string()
    .regex(/^(segment|list):.+$/)
    .optional(),
});

export async function createDraftCampaign(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const env = getServerEnv();
  const parsed = setupSchema.parse({
    name: formData.get("name"),
    fromName: formData.get("fromName") || env.SES_FROM_NAME,
    fromEmail: formData.get("fromEmail") || env.SES_FROM_EMAIL,
    replyTo: formData.get("replyTo") || undefined,
    initialAudience: formData.get("initialAudience") || undefined,
  });

  let segmentId: string | null = null;
  let listId: string | null = null;
  if (parsed.initialAudience) {
    const [kind, id] = parsed.initialAudience.split(":") as ["segment" | "list", string];
    if (kind === "segment") segmentId = id;
    else listId = id;
  }

  const slug = await uniqueSlug(slugify(parsed.name));

  const campaign = await db.campaign.create({
    data: {
      name: parsed.name,
      slug,
      // Subject/preview/template are captured in step 3. Seed empty so the row
      // is valid; the wizard forbids advancing past step 3 without them.
      subject: "",
      previewText: null,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      replyTo: parsed.replyTo,
      segmentId,
      listId,
      status: CampaignStatus.DRAFT,
      createdById: user.id,
    },
  });

  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.create", resource: `campaign:${campaign.id}`, result: "success" },
  });
  revalidatePath("/marketing/campaigns");
  redirect(`/marketing/campaigns/${campaign.id}/edit/recipients`);
}

// Step 1 rerun (edit setup on an existing draft).
export async function updateCampaignSetup(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = setupSchema.omit({ initialAudience: true }).parse({
    name: formData.get("name"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
    replyTo: formData.get("replyTo") || undefined,
  });
  await db.campaign.update({
    where: { id },
    data: {
      name: parsed.name,
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      replyTo: parsed.replyTo,
    },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_setup", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
  redirect(`/marketing/campaigns/${id}/edit/recipients`);
}

// Step 2 (Recipients).
const audienceSchema = z.object({
  audience: z.string().regex(/^(segment|list):.+$/),
});

export async function updateCampaignAudience(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = audienceSchema.parse({ audience: formData.get("audience") });
  const [kind, refId] = parsed.audience.split(":") as ["segment" | "list", string];
  await db.campaign.update({
    where: { id },
    data: {
      segmentId: kind === "segment" ? refId : null,
      listId: kind === "list" ? refId : null,
    },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_audience", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
  redirect(`/marketing/campaigns/${id}/edit/design`);
}

// Step 3 (Design): template + subject + preview.
const designSchema = z.object({
  templateId: z.string().min(1),
  subject: z.string().min(1).max(300),
  previewText: z.string().max(300).optional(),
});

export async function updateCampaignDesign(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = designSchema.parse({
    templateId: formData.get("templateId"),
    subject: formData.get("subject"),
    previewText: formData.get("previewText") || undefined,
  });
  await db.campaign.update({
    where: { id },
    data: {
      templateId: parsed.templateId,
      subject: parsed.subject,
      previewText: parsed.previewText,
    },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_design", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
  redirect(`/marketing/campaigns/${id}/edit/review`);
}

export async function sendCampaignTest(campaignId: string, to: string) {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, include: { template: true } });
  if (!campaign || !campaign.template) return { ok: false, error: "campaign or template not found" };
  const sample = Object.fromEntries(campaign.template.variables.map((v) => [v, `sample_${v}`]));
  try {
    const subject = renderTemplate(campaign.subject, sample);
    const html = renderTemplate(campaign.template.html, sample, { sanitize: true });
    const res = await EmailService.sendTest({
      to,
      subject,
      html,
      fromEmail: campaign.fromEmail,
      fromName: campaign.fromName,
      replyTo: campaign.replyTo ?? undefined,
    });
    return { ok: true, providerMessageId: res.providerMessageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Estimate audience + cost from the campaign's segment. Runs on demand from the
 * detail page's "Refresh estimate" button and before launch.
 */
export async function estimateCampaign(campaignId: string) {
  await requireRole([Role.ADMIN, Role.MARKETER, Role.VIEWER]);
  const env = getServerEnv();
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true, list: true },
  });
  if (!campaign) return { ok: false as const, error: "campaign not found" };

  if (campaign.listId) {
    const matching = await db.contactListMember.count({ where: { listId: campaign.listId } });
    const cost = (matching / 1000) * env.SES_COST_PER_THOUSAND_USD;
    return {
      ok: true as const,
      matching,
      suppressed: 0,
      final: matching,
      costUsd: Number(cost.toFixed(2)),
    };
  }

  if (!campaign.segment) return { ok: false as const, error: "audience not set" };
  const rules = ruleTreeSchema.safeParse(campaign.segment.rules);
  if (!rules.success) return { ok: false as const, error: "segment rules invalid" };
  const audience = await computeAudience(rules.data);
  const cost = (audience.final / 1000) * env.SES_COST_PER_THOUSAND_USD;
  return { ok: true as const, ...audience, costUsd: Number(cost.toFixed(2)) };
}

/**
 * Schedule or send-now the campaign. Actual fan-out (creating one EmailJob per
 * recipient and enqueueing them) is implemented in Phase 13's worker; here we
 * flip status to SCHEDULED/QUEUED and record the scheduled time. Phase 13's
 * launcher picks up SCHEDULED campaigns whose time has arrived.
 */
export async function launchCampaign(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "");
  const sendNow = formData.get("sendNow") === "on";

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
    throw new Error(`Campaign cannot be launched from status ${campaign.status}`);
  }

  const data: Prisma.CampaignUpdateInput = sendNow
    ? { status: CampaignStatus.QUEUED, scheduledAt: new Date() }
    : { status: CampaignStatus.SCHEDULED, scheduledAt: new Date(scheduledForRaw) };

  await db.campaign.update({ where: { id }, data });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: sendNow ? "campaign.send_now" : "campaign.schedule",
      resource: `campaign:${id}`,
      metadata: { scheduledFor: data.scheduledAt?.toString?.() ?? null },
      result: "success",
    },
  });

  // Phase 13's launcher endpoint will pick this up and create per-recipient jobs.
  // For send-now, kick the launcher inline so the pipeline flows end-to-end.
  if (sendNow) {
    const { launchCampaignFanout } = await import("@/server/campaigns/launcher");
    launchCampaignFanout(id).catch((err) =>
      logger.error({ err, campaignId: id }, "campaign.launch.fanout_failed"),
    );
  }

  revalidatePath(`/marketing/campaigns/${id}`);
  redirect(`/marketing/campaigns/${id}`);
}

export async function cancelCampaign(id: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Not found");
  if (campaign.status === CampaignStatus.COMPLETED) throw new Error("Already completed");
  await db.campaign.update({
    where: { id },
    data: { status: CampaignStatus.CANCELLED, cancelledAt: new Date() },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.cancel", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
}

export async function pauseCampaign(id: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.campaign.update({ where: { id }, data: { status: CampaignStatus.PAUSED } });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.pause", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
}

export async function resumeCampaign(id: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.campaign.update({ where: { id }, data: { status: CampaignStatus.SENDING } });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.resume", resource: `campaign:${id}`, result: "success" },
  });
  // Requeue any still-PENDING recipients.
  const { requeuePendingRecipients } = await import("@/server/campaigns/launcher");
  requeuePendingRecipients(id).catch((err) =>
    logger.error({ err, campaignId: id }, "campaign.resume.requeue_failed"),
  );
  revalidatePath(`/marketing/campaigns/${id}`);
}
