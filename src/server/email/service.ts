import { Prisma, EmailCategory, EmailJobStatus, EmailType } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils";
import { getServerEnv } from "@/lib/env";
import { unsubscribeUrl } from "@/server/unsubscribe/token";
import { completeCampaignIfDone, renderCampaignHtml } from "@/server/campaigns/launcher";
import {
  marketingIdempotencyKey,
  transactionalIdempotencyKey,
} from "@/server/email/idempotency";
import { checkSuppression } from "@/server/email/suppression";
import {
  assertRequiredVariables,
  MissingVariableError,
  renderTemplate,
} from "@/server/email/render";
import { getEmailProvider } from "@/server/email/provider-factory";
import { brandForAddress, domainOf, listBrands, senderBrand, sendableDefault, type BrandInfo } from "@/server/brands";
import { ProviderError } from "@/server/email/types";
import { completeDirectSendIfDone } from "@/server/direct-send/complete";
import type {
  EnqueueResult,
  ProviderAttachment,
  ProviderEvent,
  QueueMarketingEmailInput,
  QueueRawTransactionalEmailInput,
  QueueTransactionalEmailInput,
} from "@/server/email/types";

/**
 * EmailService — the single facade for both marketing and transactional email.
 *
 * queueMarketingEmail()      → called from the bulk send fan-out (Phase 13)
 * queueTransactionalEmail()  → called from the HMAC-signed API (Phase 7)
 *
 * Both enqueue a row in EmailJob with a UNIQUE idempotencyKey. Duplicate
 * requests short-circuit to { status: "duplicate" }. Suppression is checked
 * before insert (fast reject) AND again inside the worker (final safety).
 */
export const EmailService = {
  /** Marketing enqueue. Actual sending happens later via the worker. */
  async queueMarketingEmail(input: QueueMarketingEmailInput): Promise<EnqueueResult> {
    const email = normalizeEmail(input.recipient.email);
    if (!isValidEmail(email)) return { jobId: "", status: "invalid", reason: "invalid_email_format" };

    const suppression = await checkSuppression(email, EmailCategory.MARKETING);
    if (!suppression.allowed) {
      return { jobId: "", status: "suppressed", reason: suppression.reason };
    }

    const idempotencyKey = marketingIdempotencyKey(input.campaignId, email);

    try {
      const job = await db.emailJob.create({
        data: {
          idempotencyKey,
          emailType: EmailType.MARKETING,
          category: EmailCategory.MARKETING,
          status: EmailJobStatus.PENDING,
          recipientEmail: email,
          contactId: input.recipient.contactId,
          registeredUserRefId: input.recipient.registeredUserRefId,
          campaignId: input.campaignId,
          emailTemplateId: input.templateId,
          subject: input.subject,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyTo: input.replyTo,
          variables: input.variables as Prisma.InputJsonValue,
          renderedHtml: input.html,
          scheduledFor: input.scheduledFor,
        },
        select: { id: true },
      });
      return { jobId: job.id, status: "enqueued" };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await db.emailJob.findUnique({ where: { idempotencyKey }, select: { id: true } });
        return { jobId: existing?.id ?? "", status: "duplicate", reason: "idempotency_key_exists" };
      }
      throw err;
    }
  },

  /**
   * Transactional enqueue. Resolves the active template for the event's rule,
   * validates required vars, applies category-aware suppression, and inserts
   * an idempotency-keyed EmailJob.
   */
  async queueTransactionalEmail(input: QueueTransactionalEmailInput): Promise<EnqueueResult> {
    const email = normalizeEmail(input.recipient.email);
    if (!isValidEmail(email)) return { jobId: "", status: "invalid", reason: "invalid_email_format" };

    const rule = await db.emailEventRule.findUnique({ where: { eventType: input.eventType } });
    if (!rule || !rule.isActive) {
      return { jobId: "", status: "invalid", reason: `no_active_rule_for_event:${input.eventType}` };
    }

    const template = await db.transactionalTemplate.findFirst({
      where: { templateKey: rule.templateKey, isActive: true },
      orderBy: { version: "desc" },
    });
    if (!template) {
      return { jobId: "", status: "invalid", reason: `no_active_template:${rule.templateKey}` };
    }

    // Merge rule-required vars with template-declared vars; either can add a requirement.
    const required = Array.from(new Set([...(rule.requiredVars ?? []), ...(template.variables ?? [])]));
    try {
      assertRequiredVariables(required, input.variables);
    } catch (err) {
      if (err instanceof MissingVariableError) {
        return { jobId: "", status: "invalid", reason: `missing_variable:${err.variable}` };
      }
      throw err;
    }

    const sender = await resolveSender(input.overrides);
    if ("error" in sender) return { jobId: "", status: "invalid", reason: sender.error };

    const suppression = await checkSuppression(email, template.category, sender.brand.key);
    if (!suppression.allowed) {
      return { jobId: "", status: "suppressed", reason: suppression.reason };
    }

    const subject = renderTemplate(template.subject, input.variables, { strict: true });
    const html = renderTemplate(template.html, input.variables, { strict: true, sanitize: true });
    const text = template.text
      ? renderTemplate(template.text, input.variables, { strict: true })
      : undefined;

    const idempotencyKey = transactionalIdempotencyKey(input.eventId, template.templateKey, email);

    try {
      const job = await db.emailJob.create({
        data: {
          idempotencyKey,
          emailType: EmailType.TRANSACTIONAL,
          category: template.category,
          status: EmailJobStatus.PENDING,
          recipientEmail: email,
          registeredUserRefId: input.recipient.registeredUserRefId,
          contactId: input.recipient.contactId,
          templateKey: template.templateKey,
          templateVersion: template.version,
          eventType: input.eventType,
          eventId: input.eventId,
          subject,
          fromEmail: sender.fromEmail,
          fromName: sender.fromName,
          replyTo: sender.replyTo,
          variables: input.variables as Prisma.InputJsonValue,
          renderedHtml: html,
          renderedText: text,
        },
        select: { id: true },
      });
      return { jobId: job.id, status: "enqueued" };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await db.emailJob.findUnique({ where: { idempotencyKey }, select: { id: true } });
        return { jobId: existing?.id ?? "", status: "duplicate", reason: "idempotency_key_exists" };
      }
      throw err;
    }
  },

  /**
   * Transactional enqueue for content the caller rendered itself. Same
   * idempotency and suppression rules as the template path; the caller's
   * headers (allowlisted) are kept on the job and sent with it.
   */
  async queueRawTransactionalEmail(input: QueueRawTransactionalEmailInput): Promise<EnqueueResult> {
    const email = normalizeEmail(input.recipient.email);
    if (!isValidEmail(email)) return { jobId: "", status: "invalid", reason: "invalid_email_format" };

    const category = EmailCategory[input.category];
    const sender = await resolveSender(input.overrides);
    if ("error" in sender) return { jobId: "", status: "invalid", reason: sender.error };

    const suppression = await checkSuppression(email, category, sender.brand.key);
    if (!suppression.allowed) {
      return { jobId: "", status: "suppressed", reason: suppression.reason };
    }

    const idempotencyKey = transactionalIdempotencyKey(input.eventId, `raw:${input.eventType}`, email);
    const headers = pickAllowedHeaders(input.content.headers);

    try {
      const job = await db.emailJob.create({
        data: {
          idempotencyKey,
          emailType: EmailType.TRANSACTIONAL,
          category,
          status: EmailJobStatus.PENDING,
          recipientEmail: email,
          registeredUserRefId: input.recipient.registeredUserRefId,
          contactId: input.recipient.contactId,
          eventType: input.eventType,
          eventId: input.eventId,
          subject: input.content.subject,
          fromEmail: sender.fromEmail,
          fromName: sender.fromName,
          replyTo: sender.replyTo,
          // No template variables on this path; the column holds the headers.
          variables: {
            [RAW_HEADERS_KEY]: headers,
            ...(input.sensitive ? { [RAW_SENSITIVE_KEY]: true } : {}),
          } as Prisma.InputJsonValue,
          renderedHtml: input.content.html,
          renderedText: input.content.text,
        },
        select: { id: true },
      });
      return { jobId: job.id, status: "enqueued" };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await db.emailJob.findUnique({ where: { idempotencyKey }, select: { id: true } });
        return { jobId: existing?.id ?? "", status: "duplicate", reason: "idempotency_key_exists" };
      }
      throw err;
    }
  },

  /**
   * One-shot test send that bypasses the queue. Only for admin-driven "send
   * test" buttons on templates and campaigns. Does not create suppression, does
   * not create an EmailJob idempotency row, does not touch analytics.
   */
  async sendTest(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromEmail?: string;
    fromName?: string;
    replyTo?: string;
    attachments?: ProviderAttachment[];
  }) {
    const env = getServerEnv();
    const provider = getEmailProvider();
    // Without an explicit sender, test as the default brand (Settings → Senders).
    const brand = input.fromEmail ? null : sendableDefault(await listBrands());
    return provider.send({
      to: normalizeEmail(input.to),
      from: {
        email: input.fromEmail ?? brand?.fromAddresses[0] ?? env.SES_FROM_EMAIL,
        name: input.fromName ?? brand?.fromName ?? env.SES_FROM_NAME,
      },
      replyTo: input.replyTo ?? brand?.replyTo ?? env.SES_REPLY_TO,
      subject: `[TEST] ${input.subject}`,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
      configurationSet: env.SES_CONFIGURATION_SET,
      tags: { kind: "test" },
    });
  },

  /**
   * Called by the worker to actually deliver a job. Runs a second suppression
   * check (guard against races), marks status, invokes the provider, and
   * records the log entry. Idempotent on the provider result — a retry after
   * a successful send updates the same job row.
   */
  async deliverJob(jobId: string) {
    const env = getServerEnv();
    const job = await db.emailJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`job_not_found:${jobId}`);

    // Only PENDING/QUEUED/SENDING jobs may be delivered. Anything terminal
    // (sent, skipped because its campaign was cancelled/deleted, failed, ...)
    // must not go out even if a stale queue message arrives.
    const deliverable: EmailJobStatus[] = [EmailJobStatus.PENDING, EmailJobStatus.QUEUED, EmailJobStatus.SENDING];
    if (!deliverable.includes(job.status)) {
      return { skipped: true, reason: "already_sent" as const };
    }

    // Campaign-level pause / cancel takes effect mid-flight. The worker leaves
    // paused jobs PENDING so a resume can re-enqueue them; cancelled jobs are
    // marked SKIPPED and drop out of the pipeline.
    if (job.campaignId) {
      const camp = await db.campaign.findUnique({ where: { id: job.campaignId }, select: { status: true } });
      if (camp?.status === "PAUSED") return { skipped: true, reason: "campaign_paused" as const };
      if (camp?.status === "CANCELLED") {
        await db.emailJob.update({
          where: { id: job.id },
          data: { status: EmailJobStatus.SKIPPED, errorCode: "campaign_cancelled" },
        });
        return { skipped: true, reason: "campaign_cancelled" as const };
      }
    }

    if (job.directSendId) {
      const batch = await db.directSend.findUnique({ where: { id: job.directSendId }, select: { status: true } });
      if (batch?.status === "CANCELLED") {
        await db.emailJob.update({
          where: { id: job.id },
          data: { status: EmailJobStatus.SKIPPED, errorCode: "batch_cancelled" },
        });
        return { skipped: true, reason: "batch_cancelled" as const };
      }
    }

    // The brand this job sends as (from its From address): scopes unsubscribes
    // and complaints, and names the footer / unsubscribe page.
    const brand = await brandForAddress(job.fromEmail);

    // Second suppression check inside the worker — a suppression added between
    // enqueue and delivery still takes effect.
    const suppression = await checkSuppression(job.recipientEmail, job.category, brand.key);
    if (!suppression.allowed) {
      await db.emailJob.update({
        where: { id: job.id },
        data: {
          status: EmailJobStatus.SKIPPED,
          errorCode: "suppressed",
          errorMessage: suppression.reason,
          ...(isSensitive(job.variables) ? WIPED_CONTENT : {}),
        },
      });
      if (job.campaignId) {
        // Await so the promise completes before the serverless function is
        // frozen — otherwise the campaign never flips from SENDING to
        // COMPLETED once the last recipient resolves.
        await completeCampaignIfDone(job.campaignId).catch((e) =>
          logger.error({ err: e, campaignId: job.campaignId }, "campaign.complete_check.failed"),
        );
      }
      if (job.directSendId) await completeDirectSendIfDone(job.directSendId).catch(() => {});
      return { skipped: true, reason: suppression.reason };
    }

    await db.emailJob.update({
      where: { id: job.id },
      data: { status: EmailJobStatus.SENDING, attempts: { increment: 1 } },
    });

    const provider = getEmailProvider();
    // RFC 8058 one-click List-Unsubscribe for marketing sends.
    // Essential and non-essential transactional emails do not get this header.
    const listUnsub =
      job.emailType === EmailType.MARKETING
        ? unsubscribeUrl({
            email: job.recipientEmail,
            category: EmailCategory.MARKETING,
            campaignId: job.campaignId ?? undefined,
            brandKey: brand.key,
          })
        : undefined;
    const headers: Record<string, string> = {};
    if (listUnsub) {
      headers["List-Unsubscribe"] = `<${listUnsub}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    if (job.emailType === EmailType.TRANSACTIONAL) {
      Object.assign(headers, storedRawHeaders(job.variables));
    }
    try {
      let html = job.renderedHtml;
      if (html === null && job.campaignId) {
        // Campaign bodies are rendered here from the per-campaign snapshot
        // (see launcher) instead of being stored per job.
        const camp = await db.campaign.findUnique({
          where: { id: job.campaignId },
          select: { slug: true, htmlSnapshot: true, customHtml: true, template: { select: { html: true } } },
        });
        const templateHtml = camp?.htmlSnapshot ?? camp?.customHtml ?? camp?.template?.html;
        if (!camp || !templateHtml) throw new ProviderError("permanent", "campaign template missing");
        html = renderCampaignHtml(templateHtml, (job.variables ?? {}) as Record<string, string>, {
          email: job.recipientEmail,
          campaignId: job.campaignId,
          slug: camp.slug,
          brand,
        });
      }
      const attachments = await loadJobAttachments(job.attachmentIds);
      const result = await provider.send({
        to: job.recipientEmail,
        from: { email: job.fromEmail, name: job.fromName },
        replyTo: job.replyTo ?? undefined,
        subject: job.subject,
        html: html ?? "",
        text: job.renderedText ?? undefined,
        configurationSet: env.SES_CONFIGURATION_SET,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        attachments,
        tags: {
          jobId: job.id,
          emailType: job.emailType,
          campaignId: job.campaignId ?? job.directSendId ?? "none",
          templateKey: job.templateKey ?? "none",
        },
      });

      const writes: Prisma.PrismaPromise<unknown>[] = [
        db.emailJob.update({
          where: { id: job.id },
          data: {
            status: EmailJobStatus.SENT,
            sentAt: new Date(),
            providerMessageId: result.providerMessageId,
            errorCode: null,
            errorMessage: null,
            ...(isSensitive(job.variables) ? WIPED_CONTENT : {}),
          },
        }),
        db.emailLog.create({
          data: {
            jobId: job.id,
            attempt: job.attempts + 1,
            providerMessageId: result.providerMessageId,
            status: EmailJobStatus.SENT,
            sentAt: new Date(),
          },
        }),
      ];
      if (job.campaignId) {
        writes.push(
          db.campaign.update({
            where: { id: job.campaignId },
            data: { sentCount: { increment: 1 } },
          }),
        );
      }
      await db.$transaction(writes);
      if (job.campaignId) {
        await completeCampaignIfDone(job.campaignId).catch((e) =>
          logger.error({ err: e, campaignId: job.campaignId }, "campaign.complete_check.failed"),
        );
      }
      if (job.directSendId) await completeDirectSendIfDone(job.directSendId).catch(() => {});
      return { skipped: false, providerMessageId: result.providerMessageId };
    } catch (err) {
      const providerErr = err instanceof ProviderError ? err : new ProviderError("transient", (err as Error).message);
      const retryable = providerErr.kind === "throttled" || providerErr.kind === "transient";
      await db.emailJob.update({
        where: { id: job.id },
        data: {
          status: retryable ? EmailJobStatus.PENDING : EmailJobStatus.FAILED,
          errorCode: providerErr.code ?? providerErr.kind,
          errorMessage: providerErr.message,
          // A retry still needs the content; a permanent failure does not.
          ...(!retryable && isSensitive(job.variables) ? WIPED_CONTENT : {}),
        },
      });
      await db.emailLog.create({
        data: {
          jobId: job.id,
          attempt: job.attempts + 1,
          status: retryable ? EmailJobStatus.PENDING : EmailJobStatus.FAILED,
          errorCode: providerErr.code ?? providerErr.kind,
          errorMessage: providerErr.message,
        },
      });
      logger.warn({ jobId: job.id, kind: providerErr.kind, code: providerErr.code }, "email.delivery.failed");
      if (!retryable && job.campaignId) {
        // Permanent FAILED is a terminal state — see if the campaign is done.
        await completeCampaignIfDone(job.campaignId).catch((e) =>
          logger.error({ err: e, campaignId: job.campaignId }, "campaign.complete_check.failed"),
        );
      }
      if (!retryable && job.directSendId) await completeDirectSendIfDone(job.directSendId).catch(() => {});
      // Rethrow so the queue can retry retryable errors.
      throw providerErr;
    }
  },

  /**
   * Called by the SNS webhook after normalizing an SES event.
   * Correlates on `tags.jobId` first, then falls back to providerMessageId.
   */
  async processProviderEvent(event: ProviderEvent) {
    const job = await findJobForEvent(event);
    if (!job) {
      logger.warn({ providerMessageId: event.providerMessageId, type: event.type }, "email.event.no_job");
      // Still record the raw event for auditability.
      await db.emailEvent.create({
        data: {
          providerMessageId: event.providerMessageId,
          type: event.type,
          raw: event.raw as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await db.emailEvent.create({
      data: {
        jobId: job.id,
        providerMessageId: event.providerMessageId ?? job.providerMessageId,
        type: event.type,
        raw: event.raw as Prisma.InputJsonValue,
      },
    });

    const jobUpdate: Prisma.EmailJobUpdateInput = {};
    if (event.type === "DELIVERY") jobUpdate.status = EmailJobStatus.DELIVERED;
    if (event.type === "BOUNCE") jobUpdate.status = EmailJobStatus.BOUNCED;
    if (event.type === "COMPLAINT") jobUpdate.status = EmailJobStatus.COMPLAINED;

    if (Object.keys(jobUpdate).length > 0) {
      await db.emailJob.update({ where: { id: job.id }, data: jobUpdate });
    }

    const logPatch: Prisma.EmailLogUpdateManyMutationInput = {};
    if (event.type === "DELIVERY") logPatch.deliveredAt = event.occurredAt;
    if (event.type === "BOUNCE") logPatch.bouncedAt = event.occurredAt;
    if (event.type === "COMPLAINT") logPatch.complainedAt = event.occurredAt;
    if (event.type === "OPEN") logPatch.openedAt = event.occurredAt;
    if (event.type === "CLICK") logPatch.clickedAt = event.occurredAt;
    if (Object.keys(logPatch).length > 0) {
      await db.emailLog.updateMany({ where: { jobId: job.id }, data: logPatch });
    }
  },

  /** Read a job's current status — used by admin UIs. */
  async getStatus(jobId: string) {
    return db.emailJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, sentAt: true, providerMessageId: true, errorCode: true, errorMessage: true },
    });
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * From / reply-to for a transactional send: the caller's override when its
 * domain is a verified brand, else the default brand's first address. An
 * override on an unverified domain is refused rather than sent (SES would
 * reject it, and quietly swapping the sender would hide the mistake).
 */
async function resolveSender(
  overrides: { fromEmail?: string; fromName?: string; replyTo?: string } | undefined,
): Promise<{ brand: BrandInfo; fromEmail: string; fromName: string; replyTo: string | null } | { error: string }> {
  const brands = await listBrands();
  if (overrides?.fromEmail) {
    const brand = senderBrand(brands, overrides.fromEmail);
    if (!brand) return { error: `sender_not_verified:${domainOf(overrides.fromEmail)}` };
    return {
      brand,
      fromEmail: normalizeEmail(overrides.fromEmail),
      fromName: overrides.fromName ?? brand.fromName,
      replyTo: overrides.replyTo ?? brand.replyTo,
    };
  }
  const brand = sendableDefault(brands);
  const fromEmail = brand.fromAddresses[0] ?? getServerEnv().SES_FROM_EMAIL;
  return { brand, fromEmail, fromName: overrides?.fromName ?? brand.fromName, replyTo: overrides?.replyTo ?? brand.replyTo };
}

/** Files for a personal-mails job. A file deleted since launch fails the job permanently. */
async function loadJobAttachments(ids: string[]): Promise<ProviderAttachment[] | undefined> {
  if (ids.length === 0) return undefined;
  const rows = await db.mailAttachment.findMany({
    where: { id: { in: ids } },
    select: { id: true, filename: true, contentType: true, data: true },
  });
  if (rows.length !== new Set(ids).size) throw new ProviderError("permanent", "attachment no longer exists");
  return rows.map((r) => ({ filename: r.filename, contentType: r.contentType, content: new Uint8Array(r.data) }));
}

const RAW_HEADERS_KEY = "__headers";
const RAW_SENSITIVE_KEY = "__sensitive";

// What a sensitive job (one-time codes, passwords, reset links) keeps once it
// is done: no subject, no body. The row, status and timings stay for logs.
const WIPED_CONTENT = { subject: "[redacted after send]", renderedHtml: null, renderedText: null };

function isSensitive(variables: Prisma.JsonValue): boolean {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return false;
  return (variables as Record<string, unknown>)[RAW_SENSITIVE_KEY] === true;
}

// Headers a caller may set on a raw send. Anything else (From, To, Subject,
// DKIM, ...) is ours or SES's to set.
const ALLOWED_RAW_HEADERS = new Set([
  "list-unsubscribe",
  "list-unsubscribe-post",
  "x-entity-ref-id",
  "importance",
  "x-priority",
  "priority",
  "in-reply-to",
  "references",
]);

function pickAllowedHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (ALLOWED_RAW_HEADERS.has(name.toLowerCase()) && !/[\r\n]/.test(value)) out[name] = value;
  }
  return out;
}

function storedRawHeaders(variables: Prisma.JsonValue): Record<string, string> {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return {};
  const stored = (variables as Record<string, unknown>)[RAW_HEADERS_KEY];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
  return pickAllowedHeaders(stored as Record<string, string>);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s) && s.length <= 254;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function findJobForEvent(event: ProviderEvent) {
  if (event.jobId) {
    const byJob = await db.emailJob.findUnique({ where: { id: event.jobId } });
    if (byJob) return byJob;
  }
  if (event.providerMessageId) {
    return db.emailJob.findFirst({ where: { providerMessageId: event.providerMessageId } });
  }
  return null;
}
