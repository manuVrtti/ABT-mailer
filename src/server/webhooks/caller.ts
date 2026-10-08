import { EmailType } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { signHmac } from "@/server/auth/hmac";

/**
 * Report bounces and spam complaints on mail the ABTalks app sent through
 * the transactional API back to the app, the way Brevo's webhook did, so it
 * can stop sequences (résumé-import outreach) for dead or unwilling
 * addresses. Signed like the API itself: X-ABTalks-Timestamp +
 * X-ABTalks-Signature over `${ts}.${body}` with TRANSACTIONAL_API_HMAC_SECRET.
 *
 * Best effort: a failure is logged and never fails the SES webhook.
 */

export type CallerEventPayload = {
  type: "bounce" | "complaint";
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  /** The caller's own label for the mail, e.g. "resume_import.outreach.invite". */
  kind: string;
  eventId: string;
  email: string;
  occurredAt: string;
};

const TIMEOUT_MS = 5_000;

export async function reportToCaller(event: {
  type: string;
  jobId?: string;
  providerMessageId?: string;
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  occurredAt: Date;
}): Promise<void> {
  const url = process.env.CALLER_WEBHOOK_URL;
  const secret = process.env.TRANSACTIONAL_API_HMAC_SECRET;
  if (!url || !secret) return;
  if (event.type !== "BOUNCE" && event.type !== "COMPLAINT") return;

  const select = { emailType: true, eventType: true, eventId: true, recipientEmail: true } as const;
  const job =
    (event.jobId ? await db.emailJob.findUnique({ where: { id: event.jobId }, select }) : null) ??
    (event.providerMessageId ? await db.emailJob.findFirst({ where: { providerMessageId: event.providerMessageId }, select }) : null);
  // Only mail the caller asked us to send; campaigns are ours.
  if (!job || job.emailType !== EmailType.TRANSACTIONAL || !job.eventType || !job.eventId) return;

  const payload: CallerEventPayload = {
    type: event.type === "BOUNCE" ? "bounce" : "complaint",
    ...(event.bounceType ? { bounceType: event.bounceType } : {}),
    kind: job.eventType,
    eventId: job.eventId,
    email: job.recipientEmail,
    occurredAt: event.occurredAt.toISOString(),
  };
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ABTalks-Timestamp": ts,
        "X-ABTalks-Signature": `v1=${signHmac(secret, ts, body)}`,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) logger.warn({ status: res.status, kind: payload.kind, type: payload.type }, "caller_webhook.rejected");
  } catch (err) {
    logger.warn({ err: (err as Error).message, kind: payload.kind, type: payload.type }, "caller_webhook.failed");
  }
}
