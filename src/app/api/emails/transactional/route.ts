import { NextResponse } from "next/server";
import { z } from "zod";
import { EmailService } from "@/server/email";
import { verifyHmac } from "@/server/auth/hmac";
import { enqueueDelivery } from "@/server/queue/publish";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventType: z.string().min(1).max(64),
  // Caller-supplied idempotency id. ABTalks internal event/domain event id.
  eventId: z.string().min(1).max(128),
  recipient: z.object({
    email: z.string().email(),
    registeredUserRefId: z.string().optional(),
    contactId: z.string().optional(),
  }),
  variables: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
  overrides: z
    .object({
      fromEmail: z.string().email().optional(),
      fromName: z.string().min(1).max(128).optional(),
      replyTo: z.string().email().optional(),
    })
    .optional(),
});

/**
 * ABTalks main app → this endpoint. HMAC-signed. See docs/api/transactional-email.md.
 *
 * Responses:
 *   200 { status: "enqueued", jobId }
 *   200 { status: "duplicate", jobId }
 *   200 { status: "suppressed", reason }
 *   400 { status: "invalid", reason }
 *   401 { error: "unauthorized", reason }
 *
 * The 200-with-"invalid" is deliberate for cases where the caller sent us
 * something that isn't retryable (missing variable, unknown event) — they
 * shouldn't retry those; a 400 is used only when the request itself is
 * malformed.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  const verify = verifyHmac({
    secret: process.env.TRANSACTIONAL_API_HMAC_SECRET,
    timestampHeader: req.headers.get("x-abtalks-timestamp"),
    signatureHeader: req.headers.get("x-abtalks-signature"),
    body: raw,
  });
  if (!verify.ok) {
    logger.warn({ reason: verify.reason }, "transactional_api.auth.reject");
    return NextResponse.json({ error: "unauthorized", reason: verify.reason }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch (err) {
    return NextResponse.json({ error: "bad_body", detail: (err as Error).message }, { status: 400 });
  }

  const result = await EmailService.queueTransactionalEmail(parsed);

  await db.auditLog.create({
    data: {
      action: "transactional.enqueue",
      resource: `job:${result.jobId ?? "none"}`,
      metadata: {
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        status: result.status,
        reason: result.reason,
        recipient: parsed.recipient.email,
      },
      result: result.status === "enqueued" || result.status === "duplicate" ? "success" : "failure",
    },
  }).catch(() => {}); // never let audit break the response

  if (result.status === "invalid") {
    return NextResponse.json(result, { status: 400 });
  }

  if (result.status === "enqueued") {
    // Push into the priority queue for immediate delivery. Awaited: on Vercel
    // an un-awaited promise is dropped once the response is sent.
    await enqueueDelivery(result.jobId).catch((err) =>
      logger.error({ err, jobId: result.jobId }, "transactional.enqueue_delivery.failed"),
    );
  }

  return NextResponse.json(result, { status: 200 });
}
