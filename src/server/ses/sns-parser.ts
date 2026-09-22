import type { ProviderEvent } from "@/server/email/types";

/**
 * Parse an SNS-wrapped SES event message into our ProviderEvent shape.
 * SES publishes different eventType strings depending on which config-set
 * event destination was used — we normalize them.
 *
 * Reference: SES v2 Notification JSON contents
 *   https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html
 */

export type SnsEnvelope = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  Message?: string;
  SubscribeURL?: string;
  Timestamp?: string;
  TopicArn?: string;
};

interface SesMailField {
  messageId?: string;
  tags?: Record<string, string[]>;
}

interface SesEventBase {
  eventType?: string;
  notificationType?: string;
  mail?: SesMailField;
  bounce?: {
    bounceType?: "Permanent" | "Transient" | "Undetermined";
    bouncedRecipients?: Array<{ emailAddress?: string; diagnosticCode?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
    complaintFeedbackType?: string;
  };
  delivery?: { recipients?: string[] };
  open?: { ipAddress?: string; userAgent?: string; timestamp?: string };
  click?: { link?: string; ipAddress?: string; userAgent?: string; timestamp?: string };
  reject?: { reason?: string };
  send?: unknown;
}

export function parseSesEvent(rawJson: string): ProviderEvent | null {
  let payload: SesEventBase;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    return null;
  }

  const type = normalizeType(payload.eventType ?? payload.notificationType);
  if (!type) return null;

  const providerMessageId = payload.mail?.messageId;
  const tagValues = payload.mail?.tags ?? {};
  const jobId = tagValues.jobId?.[0];

  let recipient: string | undefined;
  let reason: string | undefined;
  let bounceType: "Permanent" | "Transient" | "Undetermined" | undefined;
  let clickedUrl: string | undefined;

  if (type === "BOUNCE") {
    recipient = payload.bounce?.bouncedRecipients?.[0]?.emailAddress;
    reason = payload.bounce?.bouncedRecipients?.[0]?.diagnosticCode;
    bounceType = payload.bounce?.bounceType;
  } else if (type === "COMPLAINT") {
    recipient = payload.complaint?.complainedRecipients?.[0]?.emailAddress;
    reason = payload.complaint?.complaintFeedbackType;
  } else if (type === "DELIVERY") {
    recipient = payload.delivery?.recipients?.[0];
  } else if (type === "CLICK") {
    clickedUrl = payload.click?.link;
  } else if (type === "REJECT") {
    reason = payload.reject?.reason;
  }

  return {
    type,
    providerMessageId,
    jobId,
    recipient,
    reason,
    bounceType,
    clickedUrl,
    occurredAt: new Date(),
    raw: payload,
  };
}

function normalizeType(t?: string): ProviderEvent["type"] | null {
  if (!t) return null;
  const u = t.toUpperCase();
  if (
    u === "SEND" ||
    u === "DELIVERY" ||
    u === "BOUNCE" ||
    u === "COMPLAINT" ||
    u === "OPEN" ||
    u === "CLICK" ||
    u === "REJECT" ||
    u === "RENDERING_FAILURE" ||
    u === "RENDERINGFAILURE"
  ) {
    return u === "RENDERINGFAILURE" ? "RENDERING_FAILURE" : (u as ProviderEvent["type"]);
  }
  return null;
}
