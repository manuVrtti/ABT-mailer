import { NextResponse } from "next/server";
import { EmailJobStatus } from "@prisma/client";
import { z } from "zod";
import { EmailService } from "@/server/email";
import { verifyHmac } from "@/server/auth/hmac";
import { enqueueDelivery } from "@/server/queue/publish";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const common = {
  eventType: z.string().min(1).max(64),
  // Caller-supplied idempotency id. ABTalks internal event/domain event id.
  eventId: z.string().min(1).max(128),
  recipient: z.object({
    email: z.string().email(),
    registeredUserRefId: z.string().optional(),
    contactId: z.string().optional(),
  }),
  overrides: z
    .object({
      fromEmail: z.string().email().optional(),
      fromName: z.string().min(1).max(128).optional(),
      replyTo: z.string().email().optional(),
    })
    .optional(),
};

// Template mode: an EmailEventRule picks the template, we render it.
const templateSchema = z.object({
  ...common,
  variables: z.record(z.union([z.string(), z.number(), z.null()])).default({}),
});

// Raw mode: the caller sends the finished subject/html/text.
const rawSchema = z.object({
  ...common,
  content: z.object({
    subject: z.string().min(1).max(998),
    html: z.string().min(1).max(1_000_000),
    text: z.string().max(1_000_000).optional(),
    headers: z.record(z.string().max(2000)).optional(),
  }),
  category: z.enum(["TRANSACTIONAL_NONESSENTIAL", "TRANSACTIONAL_ESSENTIAL"]).default("TRANSACTIONAL_NONESSENTIAL"),
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
 *   503 { status: "retry", jobId }  — saved but not queued; retry with the same eventId
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

  let parsed: z.infer<typeof templateSchema> | z.infer<typeof rawSchema>;
  let isRaw: boolean;
  try {
    const json: unknown = JSON.parse(raw);
    isRaw = typeof json === "object" && json !== null && "content" in json;
    parsed = isRaw ? rawSchema.parse(json) : templateSchema.parse(json);
  } catch (err) {
    return NextResponse.json({ error: "bad_body", detail: (err as Error).message }, { status: 400 });
  }

  const result =
    "content" in parsed
      ? await EmailService.queueRawTransactionalEmail(parsed)
      : await EmailService.queueTransactionalEmail(parsed);

  await db.auditLog.create({
    data: {
      action: "transactional.enqueue",
      resource: `job:${result.jobId ?? "none"}`,
      metadata: {
        eventType: parsed.eventType,
        eventId: parsed.eventId,
        mode: isRaw ? "raw" : "template",
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

  if ((result.status === "enqueued" || result.status === "duplicate") && !(await ensureQueued(result.jobId))) {
    // The job is saved but not on the queue. Tell the caller to retry: the
    // retry comes back as "duplicate" and is queued then. Answering 200 here
    // would lose the email silently.
    return NextResponse.json({ status: "retry", jobId: result.jobId }, { status: 503 });
  }

  return NextResponse.json(result, { status: 200 });
}

/**
 * Push a job onto the priority queue unless it is already there. A duplicate
 * request for a job whose first enqueue failed lands here too, so a caller's
 * retry repairs it. Awaited: on Vercel an un-awaited promise is dropped once
 * the response is sent.
 */
async function ensureQueued(jobId: string): Promise<boolean> {
  const job = await db.emailJob.findUnique({ where: { id: jobId }, select: { status: true, queuedAt: true } });
  if (!job || job.queuedAt || job.status !== EmailJobStatus.PENDING) return true;
  try {
    await enqueueDelivery(jobId);
    return true;
  } catch (err) {
    logger.error({ err, jobId }, "transactional.enqueue_delivery.failed");
    return false;
  }
}
