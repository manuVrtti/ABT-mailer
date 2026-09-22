import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/utils";

/**
 * Idempotency keys are the primary defense against duplicate sends.
 * The DB has a UNIQUE constraint on EmailJob.idempotencyKey, so any retry
 * that reuses the same key is rejected at insert time — before SES is called.
 *
 * Rules:
 *   * Marketing:      (campaign_id, normalized_email) — one job per recipient per campaign
 *   * Transactional:  (event_id, template_key, normalized_email)
 *     event_id is caller-supplied (ABTalks). If ABTalks fires USER_REGISTERED
 *     twice for the same user with the same event_id, only the first enqueues.
 */

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export function marketingIdempotencyKey(campaignId: string, email: string): string {
  return `mkt_${digest(campaignId, normalizeEmail(email))}`;
}

export function transactionalIdempotencyKey(
  eventId: string,
  templateKey: string,
  email: string,
): string {
  return `txn_${digest(eventId, templateKey, normalizeEmail(email))}`;
}
