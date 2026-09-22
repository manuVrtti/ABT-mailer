import type { EmailCategory, EmailType } from "@prisma/client";

/**
 * The shape the app hands to a provider. Provider-agnostic — no SES types leak.
 */
export interface ProviderSendPayload {
  to: string;
  from: { email: string; name?: string };
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  /** SES uses this for event correlation; the mock echoes it. */
  configurationSet?: string;
  /** Custom headers (list-unsubscribe, correlation ids, etc.). */
  headers?: Record<string, string>;
  /**
   * Message tags SES puts on every event for this send. Kept small (≤10) and
   * printable-ASCII. We tag every message with the internal job id so SNS
   * events can be joined back without depending on the SES-assigned id alone.
   */
  tags?: Record<string, string>;
}

export interface ProviderSendResult {
  providerMessageId: string;
}

/**
 * Errors surfaced from a provider MUST be classified so the worker can decide
 * whether to retry, back off, or give up. Anything not obviously retryable is
 * treated as permanent to protect deliverability.
 */
export type ProviderErrorKind =
  | "throttled"        // slow down, retry with backoff
  | "transient"        // 5xx / connection reset — retry
  | "invalid_address"  // permanent: bad recipient
  | "sender_denied"    // permanent: our from-address problem
  | "account_paused"   // permanent for this run: escalate
  | "permanent";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly code?: string;
  constructor(kind: ProviderErrorKind, message: string, code?: string) {
    super(message);
    this.kind = kind;
    this.code = code;
    this.name = "ProviderError";
  }
}

/**
 * Normalized event shape used by the SNS webhook after decoding the SES message.
 * Providers publish these into EmailService.processProviderEvent().
 */
export interface ProviderEvent {
  type: "SEND" | "DELIVERY" | "BOUNCE" | "COMPLAINT" | "OPEN" | "CLICK" | "REJECT" | "RENDERING_FAILURE";
  providerMessageId?: string;
  /** Correlation id we set in `tags.jobId` — preferred for lookup. */
  jobId?: string;
  recipient?: string;
  reason?: string;
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  clickedUrl?: string;
  userAgent?: string;
  ipAddress?: string;
  occurredAt: Date;
  raw: unknown;
}

export interface EmailProvider {
  readonly name: string;
  send(payload: ProviderSendPayload): Promise<ProviderSendResult>;
}

/**
 * Higher-level payload for EmailService callers. The service resolves
 * templates and personalization; providers only see the rendered ProviderSendPayload.
 */
export interface QueueMarketingEmailInput {
  campaignId: string;
  recipient: { email: string; contactId?: string; registeredUserRefId?: string };
  templateId: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  html: string;
  variables: Record<string, string | number | null | undefined>;
  scheduledFor?: Date;
}

export interface QueueTransactionalEmailInput {
  eventType: string;
  /** Caller-supplied idempotency id — e.g. ABTalks internal event id. */
  eventId: string;
  recipient: { email: string; registeredUserRefId?: string; contactId?: string };
  variables: Record<string, string | number | null | undefined>;
  /** Overrides for from-name/from-email when a template needs a specific sender. */
  overrides?: { fromName?: string; fromEmail?: string; replyTo?: string };
}

export interface EnqueueResult {
  jobId: string;
  status: "enqueued" | "duplicate" | "suppressed" | "invalid";
  reason?: string;
}

export type { EmailCategory, EmailType };
