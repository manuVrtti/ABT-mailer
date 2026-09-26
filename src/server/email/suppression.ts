import { EmailCategory, SuppressionReason } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";

/**
 * Category-aware suppression check.
 *
 * Rules:
 *   * MARKETING is blocked by any suppression on that email in the MARKETING
 *     bucket, plus any HARD_BOUNCE / COMPLAINT recorded anywhere.
 *   * TRANSACTIONAL_NONESSENTIAL is blocked by suppression in that bucket, plus
 *     HARD_BOUNCE anywhere. A marketing unsubscribe does NOT block it — those
 *     are separate preferences. If you want it blocked, admin adds an explicit
 *     row.
 *   * TRANSACTIONAL_ESSENTIAL (password reset, security) is ONLY blocked by
 *     HARD_BOUNCE. Complaints and unsubscribes do not stop essential mail.
 *
 * The check runs server-side inside enqueue and again inside the worker so a
 * suppression added after enqueue still takes effect.
 */

export interface SuppressionDecision {
  allowed: boolean;
  reason?: string;
}

export async function checkSuppression(
  email: string,
  category: EmailCategory,
): Promise<SuppressionDecision> {
  const normalized = normalizeEmail(email);
  const rows = await db.suppression.findMany({ where: { email: normalized } });
  return decideSuppression(rows, category);
}

/** One query for a whole batch of recipients. Emails must already be normalized. */
export async function checkSuppressionBulk(
  emails: string[],
  category: EmailCategory,
): Promise<Map<string, SuppressionDecision>> {
  const rows = emails.length > 0 ? await db.suppression.findMany({ where: { email: { in: emails } } }) : [];
  const byEmail = new Map<string, typeof rows>();
  for (const r of rows) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);
  return new Map(emails.map((e) => [e, decideSuppression(byEmail.get(e) ?? [], category)]));
}

function decideSuppression(
  rows: { reason: SuppressionReason; category: EmailCategory }[],
  category: EmailCategory,
): SuppressionDecision {
  if (rows.length === 0) return { allowed: true };

  const hardBounce = rows.find((r) => r.reason === SuppressionReason.HARD_BOUNCE);
  if (hardBounce) return { allowed: false, reason: `hard_bounce (${hardBounce.category})` };

  if (category === EmailCategory.TRANSACTIONAL_ESSENTIAL) {
    return { allowed: true }; // essential bypass unless already hard-bounced
  }

  if (category === EmailCategory.TRANSACTIONAL_NONESSENTIAL) {
    const nonessential = rows.find((r) => r.category === EmailCategory.TRANSACTIONAL_NONESSENTIAL);
    if (nonessential) return { allowed: false, reason: `suppressed:transactional_nonessential:${nonessential.reason}` };
    return { allowed: true };
  }

  // MARKETING
  const marketing = rows.find((r) => r.category === EmailCategory.MARKETING);
  if (marketing) return { allowed: false, reason: `suppressed:marketing:${marketing.reason}` };

  const complaint = rows.find((r) => r.reason === SuppressionReason.COMPLAINT);
  if (complaint) return { allowed: false, reason: `complaint (${complaint.category})` };

  return { allowed: true };
}

export async function addSuppression(
  email: string,
  category: EmailCategory,
  reason: SuppressionReason,
  note?: string,
): Promise<void> {
  const normalized = normalizeEmail(email);
  await db.suppression.upsert({
    where: { email_category: { email: normalized, category } },
    update: { reason, note },
    create: { email: normalized, category, reason, note },
  });
}
