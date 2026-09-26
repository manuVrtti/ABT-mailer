"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CampaignStatus, EmailJobStatus, Prisma, Role } from "@prisma/client";
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

// Create a fresh DRAFT. Only the campaign name is required — sender defaults
// come from env, and the audience/subject/template are set on the edit page.
const createSchema = z.object({
  name: z.string().min(1).max(200),
  initialAudience: z
    .string()
    .regex(/^(segment|list):.+$/)
    .optional(),
});

export async function createDraftCampaign(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const env = getServerEnv();
  const parsed = createSchema.parse({
    name: formData.get("name"),
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
      subject: "",
      previewText: null,
      fromName: env.SES_FROM_NAME,
      fromEmail: env.SES_FROM_EMAIL,
      replyTo: env.SES_REPLY_TO ?? null,
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
  redirect(`/marketing/campaigns/${campaign.id}/edit`);
}

// Rename the draft (inline pencil on the edit page header).
export async function updateCampaignName(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");
  await db.campaign.update({ where: { id }, data: { name } });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.rename", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}`);
  revalidatePath(`/marketing/campaigns/${id}/edit`);
  redirect(`/marketing/campaigns/${id}/edit`);
}

// Sender section.
const senderSchema = z.object({
  fromName: z.string().min(1).max(120),
  fromEmail: z.string().email(),
  replyTo: z.string().email().optional(),
});

export async function updateCampaignSender(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = senderSchema.parse({
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
    replyTo: formData.get("replyTo") || undefined,
  });
  await db.campaign.update({ where: { id }, data: parsed });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_sender", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}/edit`);
  redirect(`/marketing/campaigns/${id}/edit`);
}

// Recipients section (list OR segment — same as before).
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
  revalidatePath(`/marketing/campaigns/${id}/edit`);
  redirect(`/marketing/campaigns/${id}/edit`);
}

// Subject section — subject line + preview text.
const subjectSchema = z.object({
  subject: z.string().min(1).max(300),
  previewText: z.string().max(300).optional(),
});

export async function updateCampaignSubject(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = subjectSchema.parse({
    subject: formData.get("subject"),
    previewText: formData.get("previewText") || undefined,
  });
  await db.campaign.update({ where: { id }, data: parsed });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_subject", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}/edit`);
  redirect(`/marketing/campaigns/${id}/edit`);
}

// Design section — template only.
const templateSchema = z.object({
  templateId: z.string().min(1),
});

export async function updateCampaignTemplate(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = templateSchema.parse({ templateId: formData.get("templateId") });
  await db.campaign.update({ where: { id }, data: parsed });
  await db.auditLog.create({
    data: { userId: user.id, action: "campaign.update_template", resource: `campaign:${id}`, result: "success" },
  });
  revalidatePath(`/marketing/campaigns/${id}/edit`);
  redirect(`/marketing/campaigns/${id}/edit`);
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

  let data: Prisma.CampaignUpdateInput;
  if (sendNow) {
    data = { status: CampaignStatus.QUEUED, scheduledAt: new Date() };
  } else {
    if (!scheduledForRaw) {
      throw new Error("Pick a date and time, or tick 'Send now'.");
    }
    const parsed = new Date(scheduledForRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Schedule date is invalid — pick a valid date and time.");
    }
    data = { status: CampaignStatus.SCHEDULED, scheduledAt: parsed };
  }

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
  // For send-now, run the fanout inline so the pipeline flows end-to-end.
  //
  // We MUST await here: on Vercel serverless a fire-and-forget promise dies
  // the moment the response ships (the function is frozen), so the fanout
  // would never enqueue anything and the campaign would sit in QUEUED
  // forever with Started=—. Awaiting keeps the function alive until the fan
  // out is done. For small tests (single recipient) this is a few hundred
  // ms; for larger sends we'll layer a QStash-backed batched launcher.
  if (sendNow) {
    const { launchCampaignFanout } = await import("@/server/campaigns/launcher");
    try {
      await launchCampaignFanout(id);
    } catch (err) {
      logger.error({ err, campaignId: id }, "campaign.launch.fanout_failed");
      throw new Error(
        `Fan-out failed: ${(err as Error).message}. The campaign is still in QUEUED; retry from the detail page.`,
      );
    }
  }

  revalidatePath(`/marketing/campaigns/${id}`);
  redirect(`/marketing/campaigns/${id}`);
}

const IN_FLIGHT: CampaignStatus[] = [CampaignStatus.QUEUED, CampaignStatus.SENDING, CampaignStatus.PAUSED];

export async function deleteCampaign(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const campaign = await db.campaign.findUnique({ where: { id }, select: { status: true, name: true } });
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (IN_FLIGHT.includes(campaign.status)) {
    return { ok: false, error: `“${campaign.name}” is ${campaign.status.toLowerCase()}. Cancel it first, then delete.` };
  }

  // Email jobs survive the delete (their campaign link is nulled) so delivery
  // history stays intact. Anything still unsent must never go out afterwards.
  await db.$transaction([
    db.emailJob.updateMany({
      where: { campaignId: id, status: { in: [EmailJobStatus.PENDING, EmailJobStatus.QUEUED] } },
      data: { status: EmailJobStatus.SKIPPED, errorCode: "campaign_deleted" },
    }),
    db.campaign.delete({ where: { id } }),
  ]);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "campaign.delete",
      resource: `campaign:${id}`,
      metadata: { name: campaign.name, status: campaign.status },
      result: "success",
    },
  });
  revalidatePath("/marketing/campaigns");
  return { ok: true };
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
  await requeuePendingRecipients(id).catch((err) =>
    logger.error({ err, campaignId: id }, "campaign.resume.requeue_failed"),
  );
  revalidatePath(`/marketing/campaigns/${id}`);
}
