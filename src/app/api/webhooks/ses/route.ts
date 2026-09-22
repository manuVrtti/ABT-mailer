import { NextResponse } from "next/server";
import MessageValidator from "sns-validator";
import { EmailCategory, SuppressionReason } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { EmailService } from "@/server/email";
import { parseSesEvent, type SnsEnvelope } from "@/server/ses/sns-parser";
import { addSuppression } from "@/server/email/suppression";
import { normalizeEmail } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Amazon SES → SNS → this endpoint. Public URL, but validated by SNS's
 * signature scheme (sns-validator) before we touch the body.
 *
 * Handled envelopes:
 *   * SubscriptionConfirmation — we auto-confirm by GETting the SubscribeURL.
 *   * Notification            — decode payload.Message and route by eventType.
 *   * UnsubscribeConfirmation — no-op ack.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let envelope: SnsEnvelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const validator = new MessageValidator();
  const isValid = await new Promise<boolean>((resolve) => {
    validator.validate(envelope as unknown as Parameters<typeof validator.validate>[0], (err) => resolve(!err));
  });
  if (!isValid) {
    logger.warn({ topic: envelope.TopicArn }, "sns.signature.invalid");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (envelope.Type === "SubscriptionConfirmation" && envelope.SubscribeURL) {
    // Confirm asynchronously; don't block the SNS retry loop.
    fetch(envelope.SubscribeURL).catch(() => {});
    logger.info({ topic: envelope.TopicArn }, "sns.subscription.confirmed");
    return NextResponse.json({ ok: true, confirmed: true });
  }

  if (envelope.Type === "UnsubscribeConfirmation") {
    return NextResponse.json({ ok: true });
  }

  if (envelope.Type !== "Notification" || !envelope.Message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = parseSesEvent(envelope.Message);
  if (!event) {
    logger.warn({ topic: envelope.TopicArn }, "ses.event.unrecognized");
    return NextResponse.json({ ok: true, ignored: true });
  }

  await EmailService.processProviderEvent(event);
  await bumpCampaignCounter(event);
  await maybeSuppress(event);

  return NextResponse.json({ ok: true, type: event.type });
}

async function bumpCampaignCounter(event: {
  type: string;
  providerMessageId?: string;
  jobId?: string;
}) {
  const job = await findJob(event);
  if (!job?.campaignId) return;
  switch (event.type) {
    case "DELIVERY":
      await db.campaign.update({ where: { id: job.campaignId }, data: { deliveredCount: { increment: 1 } } });
      break;
    case "BOUNCE":
      await db.campaign.update({ where: { id: job.campaignId }, data: { bouncedCount: { increment: 1 } } });
      break;
    case "COMPLAINT":
      await db.campaign.update({ where: { id: job.campaignId }, data: { complainedCount: { increment: 1 } } });
      break;
    case "OPEN":
      await db.campaign.update({ where: { id: job.campaignId }, data: { openedCount: { increment: 1 } } });
      break;
    case "CLICK":
      await db.campaign.update({ where: { id: job.campaignId }, data: { clickedCount: { increment: 1 } } });
      break;
  }
}

async function findJob(event: { jobId?: string; providerMessageId?: string }) {
  if (event.jobId) {
    const j = await db.emailJob.findUnique({ where: { id: event.jobId }, select: { id: true, campaignId: true, recipientEmail: true } });
    if (j) return j;
  }
  if (event.providerMessageId) {
    return db.emailJob.findFirst({
      where: { providerMessageId: event.providerMessageId },
      select: { id: true, campaignId: true, recipientEmail: true },
    });
  }
  return null;
}

async function maybeSuppress(event: {
  type: string;
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  recipient?: string;
}) {
  if (!event.recipient) return;
  const email = normalizeEmail(event.recipient);
  if (event.type === "BOUNCE" && event.bounceType === "Permanent") {
    // Hard bounces are global suppressions — never send to this email again.
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.HARD_BOUNCE, "auto: SES bounce");
    await addSuppression(email, EmailCategory.TRANSACTIONAL_NONESSENTIAL, SuppressionReason.HARD_BOUNCE, "auto: SES bounce");
    await addSuppression(email, EmailCategory.TRANSACTIONAL_ESSENTIAL, SuppressionReason.HARD_BOUNCE, "auto: SES bounce");
  }
  if (event.type === "COMPLAINT") {
    // Complaints suppress marketing and non-essential transactional; essential
    // (password reset, security) still goes through unless hard-bounced later.
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.COMPLAINT, "auto: SES complaint");
    await addSuppression(email, EmailCategory.TRANSACTIONAL_NONESSENTIAL, SuppressionReason.COMPLAINT, "auto: SES complaint");
  }
}
