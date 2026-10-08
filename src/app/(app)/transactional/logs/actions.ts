"use server";

import { revalidatePath } from "next/cache";
import { EmailJobStatus, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { renderCampaignHtml } from "@/server/campaigns/launcher";
import { enqueueDelivery } from "@/server/queue/publish";

export type LogActionResult = { ok: true; jobId?: string } | { ok: false; error: string };

/** Subject a sensitive job is left with once its content is wiped. */
const WIPED_SUBJECT = "[redacted after send]";

/**
 * Send the same email to the same recipient again, as a new job. Campaign
 * mail is rendered from the campaign snapshot and sent without the campaign
 * link, so a resend never changes the campaign's numbers. Suppression is
 * still checked when it is delivered.
 */
export async function resendLogEmail(jobId: string): Promise<LogActionResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const job = await db.emailJob.findUnique({
    where: { id: jobId },
    include: {
      campaign: { select: { slug: true, htmlSnapshot: true, customHtml: true, template: { select: { html: true } } } },
    },
  });
  if (!job) return { ok: false, error: "Email not found." };
  if (job.subject === WIPED_SUBJECT) {
    return {
      ok: false,
      error: "This email held a one-time code or password and its content was wiped after sending. Trigger it again from the website.",
    };
  }

  let html = job.renderedHtml;
  if (html === null && job.campaign) {
    const templateHtml = job.campaign.htmlSnapshot ?? job.campaign.customHtml ?? job.campaign.template?.html;
    if (templateHtml) {
      html = renderCampaignHtml(templateHtml, (job.variables ?? {}) as Record<string, string>, {
        email: job.recipientEmail,
        campaignId: job.campaignId!,
        slug: job.campaign.slug,
      });
    }
  }
  if (!html) return { ok: false, error: "This email has no content to resend." };

  const copy = await db.emailJob.create({
    data: {
      idempotencyKey: `resend_${job.id}_${Date.now()}`,
      emailType: job.emailType,
      category: job.category,
      status: EmailJobStatus.PENDING,
      recipientEmail: job.recipientEmail,
      contactId: job.contactId,
      registeredUserRefId: job.registeredUserRefId,
      templateKey: job.templateKey,
      templateVersion: job.templateVersion,
      eventType: job.eventType,
      eventId: job.eventId,
      subject: job.subject,
      fromEmail: job.fromEmail,
      fromName: job.fromName,
      replyTo: job.replyTo,
      variables: (job.variables ?? {}) as Prisma.InputJsonValue,
      renderedHtml: html,
      renderedText: job.renderedText,
    },
    select: { id: true },
  });
  await enqueueDelivery(copy.id);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "email_log.resend",
      resource: `job:${copy.id}`,
      metadata: { originalJobId: job.id },
      result: "success",
    },
  });
  revalidatePath("/transactional/logs");
  return { ok: true, jobId: copy.id };
}

/**
 * Remove a transactional email's log: the job, its attempts and its SES
 * events. Campaign mail is refused — its job is what the campaign's
 * recipient activity and counts are built from.
 */
export async function deleteLogEmail(jobId: string): Promise<LogActionResult> {
  const user = await requireRole([Role.ADMIN]);
  const job = await db.emailJob.findUnique({ where: { id: jobId }, select: { id: true, campaignId: true } });
  if (!job) return { ok: false, error: "Email not found." };
  if (job.campaignId) {
    return { ok: false, error: "Campaign emails can't be deleted here — they make up the campaign's results." };
  }
  await db.$transaction([
    db.emailEvent.deleteMany({ where: { jobId } }),
    db.emailJob.delete({ where: { id: jobId } }),
  ]);
  await db.auditLog.create({
    data: { userId: user.id, action: "email_log.delete", resource: `job:${jobId}`, result: "success" },
  });
  revalidatePath("/transactional/logs");
  return { ok: true };
}
