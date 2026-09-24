import { EmailType } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { qstashClient, isQStashConfigured } from "@/server/queue/qstash";
import { getServerEnv } from "@/lib/env";
import { EmailService } from "@/server/email";

export type DeliveryJobBody = {
  jobId: string;
  attempt?: number; // caller-supplied only for diagnostics; QStash tracks retries
};

/**
 * Enqueue a single EmailJob for delivery. Routes to the correct QStash queue
 * based on emailType. When QStash is not configured (local dev without
 * credentials) the job is delivered inline via EmailService.deliverJob — this
 * lets integration tests exercise the full pipeline without external infra.
 */
export async function enqueueDelivery(jobId: string): Promise<{ queued: boolean; via: "qstash" | "inline" }> {
  const job = await db.emailJob.findUnique({
    where: { id: jobId },
    select: { id: true, emailType: true, status: true, scheduledFor: true },
  });
  if (!job) throw new Error(`enqueueDelivery: job ${jobId} not found`);

  if (!isQStashConfigured()) {
    logger.warn({ jobId }, "queue.inline_fallback — QSTASH not configured");
    // Fire-and-forget in dev; production always uses QStash.
    EmailService.deliverJob(jobId).catch((err) => logger.error({ err, jobId }, "inline.deliver.failed"));
    return { queued: true, via: "inline" };
  }

  const env = getServerEnv();
  const queueName =
    job.emailType === EmailType.TRANSACTIONAL ? env.QSTASH_QUEUE_TRANSACTIONAL : env.QSTASH_QUEUE_MARKETING;

  const client = qstashClient();
  const url = new URL("/api/qstash/deliver", env.NEXT_PUBLIC_APP_URL).toString();
  const body: DeliveryJobBody = { jobId };

  const delaySeconds = job.scheduledFor
    ? Math.max(0, Math.floor((job.scheduledFor.getTime() - Date.now()) / 1000))
    : undefined;

  await client.queue({ queueName }).enqueueJSON({
    url,
    body,
    // 3 retries with exponential backoff (QStash default). Beyond that,
    // QStash routes to its DLQ; we surface those as failed jobs to admins.
    retries: 3,
    delay: delaySeconds,
    // Deduplicate at the queue layer too — belt and braces alongside the
    // EmailJob.idempotencyKey unique constraint in the DB. Colons are
    // rejected by QStash ("DeduplicationId cannot contain ':'"), so use
    // an underscore delimiter.
    deduplicationId: `deliver_${jobId}`,
  });

  await db.emailJob.update({ where: { id: jobId }, data: { queuedAt: new Date() } });
  return { queued: true, via: "qstash" };
}

/**
 * Enqueue a chunked import task. Used by Phase 9 (CSV import). Uses the
 * marketing/bulk queue so a huge import never crowds out password resets.
 */
export async function enqueueImportChunk(payload: {
  importJobId: string;
  offset: number;
  size: number;
}): Promise<void> {
  if (!isQStashConfigured()) {
    logger.warn({ payload }, "queue.inline_fallback — QSTASH not configured for import chunk");
    return;
  }
  const env = getServerEnv();
  const client = qstashClient();
  const url = new URL("/api/qstash/import-chunk", env.NEXT_PUBLIC_APP_URL).toString();
  await client.queue({ queueName: env.QSTASH_QUEUE_MARKETING }).enqueueJSON({
    url,
    body: payload,
    retries: 3,
    deduplicationId: `import_${payload.importJobId}_${payload.offset}`,
  });
}
