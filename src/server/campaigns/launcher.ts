import { CampaignStatus, EmailCategory, EmailJobStatus, EmailType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ruleTreeSchema } from "@/server/segments/schema";
import { compileWhere } from "@/server/segments/compile";
import { marketingIdempotencyKey } from "@/server/email/idempotency";
import { checkSuppressionBulk } from "@/server/email/suppression";
import { renderTemplate } from "@/server/email/render";
import { enqueueDeliveries, enqueueFanoutContinuation } from "@/server/queue/publish";
import { isQStashConfigured } from "@/server/queue/qstash";
import { unsubscribeUrl } from "@/server/unsubscribe/token";
import { addUtmToHtml } from "@/server/utm/rewrite";

// Contacts per DB round. Each batch is ~7 queries + 2 QStash batch calls.
const BATCH_SIZE = 200;
// Stop and hand off to a fresh invocation well before Vercel's limit.
const DEFAULT_TIME_BUDGET_MS = 40_000;
// A fan-out may continue while a campaign is paused (delivery respects the
// pause); only a cancel stops it.
const FANOUT_STATUSES: CampaignStatus[] = [
  CampaignStatus.QUEUED,
  CampaignStatus.SCHEDULED,
  CampaignStatus.SENDING,
  CampaignStatus.PAUSED,
];

type ContactVars = Record<string, string | number | null>;

/**
 * Final HTML for one campaign recipient. Rendered at delivery time from the
 * campaign's HTML snapshot, so we store one copy of the template per campaign
 * instead of ~30 KB per recipient.
 */
export function renderCampaignHtml(
  templateHtml: string,
  variables: ContactVars,
  ctx: { email: string; campaignId: string; slug: string },
): string {
  let html = renderTemplate(templateHtml, variables, { sanitize: true });
  html = addUtmToHtml(html, { source: "email", medium: "campaign", campaign: ctx.slug });
  const unsubUrl = unsubscribeUrl({ email: ctx.email, category: EmailCategory.MARKETING, campaignId: ctx.campaignId });
  html += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eaeaea;font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif;">ABTalks · This email was sent to ${ctx.email}. <a href="${unsubUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>.</div>`;
  return html;
}

/**
 * Materialize a campaign's audience into CampaignRecipient + EmailJob rows and
 * queue them for delivery, in batches of BATCH_SIZE contacts ordered by id.
 *
 * Runs until the audience is exhausted or the time budget is spent; in the
 * latter case it publishes a continuation to /api/qstash/campaigns/fanout that
 * resumes after the last processed contact. Every step is idempotent
 * (unique idempotency key per job, unique (campaign, email) per recipient,
 * only never-queued jobs are enqueued), so a retried batch never double-sends.
 */
export async function launchCampaignFanout(
  campaignId: string,
  opts: { afterContactId?: string; timeBudgetMs?: number } = {},
): Promise<{ enqueued: number; skipped: number; done: boolean }> {
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { segment: true, list: true, template: true },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (!campaign.template) throw new Error("Template required");
  if (!campaign.segment && !campaign.list) throw new Error("Segment or list required");
  if (campaign.status === CampaignStatus.CANCELLED) return { enqueued: 0, skipped: 0, done: true };
  if (!FANOUT_STATUSES.includes(campaign.status)) {
    throw new Error(`Cannot fan out from status ${campaign.status}`);
  }

  // Audience is either a Segment (compiled to a Prisma where) or a ContactList.
  const audience: Prisma.MarketingContactWhereInput = campaign.list
    ? { lists: { some: { listId: campaign.list.id } } }
    : compileWhere(ruleTreeSchema.parse(campaign.segment!.rules));

  // First batch: flip to SENDING and freeze the template for this campaign.
  if (!opts.afterContactId) {
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: campaign.status === CampaignStatus.PAUSED ? CampaignStatus.PAUSED : CampaignStatus.SENDING,
        startedAt: campaign.startedAt ?? new Date(),
        htmlSnapshot: campaign.htmlSnapshot ?? campaign.template.html,
        fanoutCompletedAt: null,
      },
    });
  }

  let cursor = opts.afterContactId;
  let enqueued = 0;
  let skipped = 0;

  for (;;) {
    const batch = await db.marketingContact.findMany({
      where: { AND: [audience, cursor ? { id: { gt: cursor } } : {}] },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) {
      await finishFanout(campaignId);
      logger.info({ campaignId, enqueued, skipped }, "campaign.fanout.complete");
      return { enqueued, skipped, done: true };
    }

    const r = await processBatch(campaign, batch);
    enqueued += r.enqueued;
    skipped += r.skipped;
    cursor = batch[batch.length - 1]!.id;

    // Stop if the campaign was cancelled mid-launch.
    const current = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (!current || current.status === CampaignStatus.CANCELLED) {
      await finishFanout(campaignId);
      return { enqueued, skipped, done: true };
    }

    if (batch.length < BATCH_SIZE) continue; // next loop sees the empty page and finishes
    if (Date.now() - started > budget && isQStashConfigured()) {
      await enqueueFanoutContinuation(campaignId, cursor);
      logger.info({ campaignId, enqueued, skipped, cursor }, "campaign.fanout.continued");
      return { enqueued, skipped, done: false };
    }
  }
}

async function processBatch(
  campaign: { id: string; slug: string; subject: string; templateId: string | null; fromEmail: string; fromName: string; replyTo: string | null },
  batch: { id: string; email: string; firstName: string | null; lastName: string | null; college: string | null; branch: string | null; year: string | null }[],
): Promise<{ enqueued: number; skipped: number }> {
  const suppression = await checkSuppressionBulk(
    batch.map((c) => c.email),
    EmailCategory.MARKETING,
  );

  let skipped = 0;
  const rows: Prisma.EmailJobCreateManyInput[] = [];
  const recipients: { email: string; contactId: string; variables: ContactVars; key: string }[] = [];

  for (const contact of batch) {
    const variables: ContactVars = {
      first_name: contact.firstName ?? "",
      last_name: contact.lastName ?? "",
      college: contact.college ?? "",
      branch: contact.branch ?? "",
      year: contact.year ?? "",
      email: contact.email,
    };
    let subject: string;
    try {
      subject = renderTemplate(campaign.subject, variables);
    } catch (err) {
      logger.warn({ err, campaignId: campaign.id, email: contact.email }, "campaign.render.failed");
      skipped++;
      continue;
    }
    const decision = suppression.get(contact.email) ?? { allowed: true };
    const key = marketingIdempotencyKey(campaign.id, contact.email);
    rows.push({
      idempotencyKey: key,
      emailType: EmailType.MARKETING,
      category: EmailCategory.MARKETING,
      status: decision.allowed ? EmailJobStatus.PENDING : EmailJobStatus.SKIPPED,
      recipientEmail: contact.email,
      contactId: contact.id,
      campaignId: campaign.id,
      emailTemplateId: campaign.templateId,
      subject,
      fromEmail: campaign.fromEmail,
      fromName: campaign.fromName,
      replyTo: campaign.replyTo,
      variables: variables as Prisma.InputJsonValue,
      // Body is rendered at delivery time from campaign.htmlSnapshot.
      renderedHtml: null,
      errorCode: decision.allowed ? null : "suppressed",
      errorMessage: decision.reason ?? null,
    });
    recipients.push({ email: contact.email, contactId: contact.id, variables, key });
  }

  if (rows.length === 0) return { enqueued: 0, skipped };

  await db.emailJob.createMany({ data: rows, skipDuplicates: true });
  const jobs = await db.emailJob.findMany({
    where: { idempotencyKey: { in: rows.map((r) => r.idempotencyKey) } },
    select: { id: true, idempotencyKey: true, status: true, queuedAt: true },
  });
  const jobByKey = new Map(jobs.map((j) => [j.idempotencyKey, j]));

  const created = await db.campaignRecipient.createMany({
    data: recipients.map((r) => ({
      campaignId: campaign.id,
      email: r.email,
      contactId: r.contactId,
      variables: r.variables as Prisma.InputJsonValue,
      emailJobId: jobByKey.get(r.key)?.id ?? null,
    })),
    skipDuplicates: true,
  });
  if (created.count > 0) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { totalRecipients: { increment: created.count } },
    });
  }

  // Only jobs that were never queued — a retried batch must not re-send.
  const toQueue = jobs.filter((j) => j.status === EmailJobStatus.PENDING && !j.queuedAt).map((j) => j.id);
  skipped += jobs.filter((j) => j.status === EmailJobStatus.SKIPPED).length;
  try {
    await enqueueDeliveries(toQueue);
    return { enqueued: toQueue.length, skipped };
  } catch (err) {
    logger.error({ err, campaignId: campaign.id, count: toQueue.length }, "campaign.enqueue.failed");
    await db.emailJob.updateMany({
      where: { id: { in: toQueue }, queuedAt: null },
      data: {
        status: EmailJobStatus.FAILED,
        errorCode: "enqueue_failed",
        errorMessage: (err as Error).message.slice(0, 500),
      },
    });
    return { enqueued: 0, skipped: skipped + toQueue.length };
  }
}

async function finishFanout(campaignId: string) {
  await db.campaign.update({ where: { id: campaignId }, data: { fanoutCompletedAt: new Date() } });
  // Deliveries may all have resolved while we were still fanning out (or
  // everything was suppressed) — nothing else would complete the campaign.
  await completeCampaignIfDone(campaignId).catch((e) =>
    logger.error({ err: e, campaignId }, "campaign.complete_check.failed"),
  );
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
  await enqueueDeliveries(pending.map((j) => j.id)).catch((err) =>
    logger.error({ err, campaignId }, "campaign.requeue.failed"),
  );
  return pending.length;
}

/**
 * Flip a SENDING campaign to COMPLETED once its launch has finished queuing
 * everyone and no job remains in flight. Requiring fanoutCompletedAt stops a
 * big campaign from being marked COMPLETED between two launch batches.
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
    where: { id: campaignId, status: CampaignStatus.SENDING, fanoutCompletedAt: { not: null } },
    data: { status: CampaignStatus.COMPLETED, completedAt: new Date() },
  });
  return res.count > 0;
}
