import { CampaignStatus, EmailCategory, EmailJobStatus, EmailType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ruleTreeSchema } from "@/server/segments/schema";
import { compileWhere } from "@/server/segments/compile";
import { marketingIdempotencyKey } from "@/server/email/idempotency";
import { checkSuppression } from "@/server/email/suppression";
import { renderTemplate } from "@/server/email/render";
import { enqueueDelivery } from "@/server/queue/publish";
import { unsubscribeUrl } from "@/server/unsubscribe/token";
import { addUtmToHtml } from "@/server/utm/rewrite";

const BATCH_SIZE = 500;

/**
 * Materialize a campaign's audience into CampaignRecipient + EmailJob rows.
 *
 * Every recipient is protected by (campaign_id, email) UNIQUE on
 * CampaignRecipient and by the idempotency_key UNIQUE on EmailJob — a retry of
 * this function skips duplicates rather than creating them.
 *
 * Recipients that fail server-side suppression are recorded as SKIPPED so the
 * counts on the campaign page match reality.
 */
export async function launchCampaignFanout(campaignId: string): Promise<{ enqueued: number; skipped: number }> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true, list: true, template: true },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.template) throw new Error("Template required");
  if (!campaign.segment && !campaign.list) throw new Error("Segment or list required");
  if (
    campaign.status !== CampaignStatus.QUEUED &&
    campaign.status !== CampaignStatus.SCHEDULED &&
    campaign.status !== CampaignStatus.SENDING
  ) {
    throw new Error(`Cannot fan out from status ${campaign.status}`);
  }

  // Audience is either a Segment (compiled to a Prisma where) or a ContactList
  // (a fixed member set). Both are cursor-paginated over MarketingContact.
  let where: Prisma.MarketingContactWhereInput;
  if (campaign.list) {
    where = { lists: { some: { listId: campaign.list.id } } };
  } else {
    const rules = ruleTreeSchema.parse(campaign.segment!.rules);
    where = compileWhere(rules);
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.SENDING, startedAt: new Date() },
  });

  let cursor: string | undefined;
  let total = 0;
  let skipped = 0;

  for (;;) {
    // Cursor-paginated read — never load 100k rows at once.
    const batch = await db.marketingContact.findMany({
      where,
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    for (const contact of batch) {
      const idempotencyKey = marketingIdempotencyKey(campaignId, contact.email);
      const suppression = await checkSuppression(contact.email, EmailCategory.MARKETING);

      // Personalization variables built from contact fields.
      const variables: Record<string, string | number | null> = {
        first_name: contact.firstName ?? "",
        last_name: contact.lastName ?? "",
        college: contact.college ?? "",
        branch: contact.branch ?? "",
        year: contact.year ?? "",
        email: contact.email,
      };

      let subject: string;
      let html: string;
      try {
        subject = renderTemplate(campaign.subject, variables);
        html = renderTemplate(campaign.template.html, variables, { sanitize: true });
      } catch (err) {
        logger.warn({ err, campaignId, email: contact.email }, "campaign.render.failed");
        skipped++;
        continue;
      }

      // Rewrite every http(s) link with UTM parameters so ABTalks main can
      // attribute the traffic back to this campaign.
      html = addUtmToHtml(html, {
        source: "email",
        medium: "campaign",
        campaign: campaign.slug,
      });

      // Append a clearly-visible unsubscribe footer to every marketing send.
      // The List-Unsubscribe header is added at delivery time in EmailService.
      const unsubUrl = unsubscribeUrl({
        email: contact.email,
        category: EmailCategory.MARKETING,
        campaignId,
      });
      html += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eaeaea;font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif;">ABTalks · This email was sent to ${contact.email}. <a href="${unsubUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>.</div>`;

      try {
        // Idempotent insert of job + recipient row.
        const job = await db.emailJob.upsert({
          where: { idempotencyKey },
          update: {},
          create: {
            idempotencyKey,
            emailType: EmailType.MARKETING,
            category: EmailCategory.MARKETING,
            status: suppression.allowed ? EmailJobStatus.PENDING : EmailJobStatus.SKIPPED,
            recipientEmail: contact.email,
            contactId: contact.id,
            campaignId,
            emailTemplateId: campaign.templateId,
            subject,
            fromEmail: campaign.fromEmail,
            fromName: campaign.fromName,
            replyTo: campaign.replyTo,
            variables: variables as Prisma.InputJsonValue,
            renderedHtml: html,
            errorCode: suppression.allowed ? null : "suppressed",
            errorMessage: suppression.reason ?? null,
          },
        });

        await db.campaignRecipient.upsert({
          where: { campaignId_email: { campaignId, email: contact.email } },
          update: { emailJobId: job.id },
          create: {
            campaignId,
            email: contact.email,
            contactId: contact.id,
            variables: variables as Prisma.InputJsonValue,
            emailJobId: job.id,
          },
        });

        if (suppression.allowed && job.status === EmailJobStatus.PENDING) {
          await enqueueDelivery(job.id).catch((err) => {
            logger.error({ err, jobId: job.id, campaignId }, "campaign.enqueue.failed");
          });
          total++;
        } else {
          skipped++;
        }
      } catch (err) {
        logger.error({ err, campaignId, email: contact.email }, "campaign.fanout.row_failed");
        skipped++;
      }
    }
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { totalRecipients: total + skipped },
  });

  logger.info({ campaignId, enqueued: total, skipped }, "campaign.fanout.complete");

  // If every recipient was skipped (empty audience or all suppressed), no
  // deliver-job callback will fire — complete the campaign now instead of
  // leaving it in SENDING forever.
  if (total === 0) {
    await completeCampaignIfDone(campaignId).catch((e) =>
      logger.error({ err: e, campaignId }, "campaign.complete_check.failed"),
    );
  }

  return { enqueued: total, skipped };
}

/**
 * Called by resumeCampaign — re-enqueues any recipients still in PENDING.
 * Idempotency keeps this safe to call repeatedly.
 */
export async function requeuePendingRecipients(campaignId: string): Promise<number> {
  const pending = await db.emailJob.findMany({
    where: { campaignId, status: EmailJobStatus.PENDING },
    select: { id: true },
    take: 10_000,
  });
  for (const job of pending) {
    await enqueueDelivery(job.id).catch((err) =>
      logger.error({ err, jobId: job.id }, "campaign.requeue.failed"),
    );
  }
  return pending.length;
}

/**
 * Flip a SENDING campaign to COMPLETED if no jobs remain in any in-flight
 * state (PENDING / QUEUED / SENDING). Idempotent and race-safe: a concurrent
 * fan-out that adds a new PENDING job after this query loses to `status =
 * SENDING` in the WHERE clause, and future job resolutions will retry the
 * check.
 */
export async function completeCampaignIfDone(campaignId: string): Promise<boolean> {
  const inFlight = await db.emailJob.count({
    where: {
      campaignId,
      status: { in: [EmailJobStatus.PENDING, EmailJobStatus.QUEUED, EmailJobStatus.SENDING] },
    },
  });
  if (inFlight > 0) return false;
  const res = await db.campaign.updateMany({
    where: { id: campaignId, status: CampaignStatus.SENDING },
    data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
  });
  return res.count > 0;
}
