import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { ProviderError } from "@/server/email/types";
import type { EmailProvider, ProviderErrorKind, ProviderSendPayload, ProviderSendResult } from "@/server/email/types";
import { logger } from "@/lib/logger";

/**
 * Amazon SES v2 provider. Server-only. No AWS SDK types are exposed above
 * this file — the rest of the app only sees ProviderSendPayload/Result.
 */
export class SESProvider implements EmailProvider {
  readonly name = "ses";
  private readonly client: SESv2Client;

  constructor(opts: { region: string; accessKeyId?: string; secretAccessKey?: string }) {
    this.client = new SESv2Client({
      region: opts.region,
      // Prefer explicit env; otherwise fall back to the AWS default credential
      // chain (useful on Vercel with an OIDC-issued role in future).
      credentials:
        opts.accessKeyId && opts.secretAccessKey
          ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
          : undefined,
    });
  }

  async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const fromAddress = payload.from.name
      ? `${sanitizeFromName(payload.from.name)} <${payload.from.email}>`
      : payload.from.email;

    const cmd = new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: { ToAddresses: [payload.to] },
      ReplyToAddresses: payload.replyTo ? [payload.replyTo] : undefined,
      ConfigurationSetName: payload.configurationSet,
      EmailTags: payload.tags
        ? Object.entries(payload.tags)
            .slice(0, 10) // SES caps tags per message
            .map(([Name, Value]) => ({ Name: sanitizeTag(Name), Value: sanitizeTag(Value) }))
        : undefined,
      Content: {
        Simple: {
          Subject: { Data: payload.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: payload.html, Charset: "UTF-8" },
            Text: payload.text ? { Data: payload.text, Charset: "UTF-8" } : undefined,
          },
          Headers: payload.headers
            ? Object.entries(payload.headers).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        },
      },
    });

    try {
      const res = await this.client.send(cmd);
      const providerMessageId = res.MessageId;
      if (!providerMessageId) {
        throw new ProviderError("transient", "SES returned no MessageId");
      }
      return { providerMessageId };
    } catch (err: unknown) {
      const classified = classifySesError(err);
      logger.error(
        { kind: classified.kind, code: classified.code, err: (err as Error).message },
        "ses.send.failed",
      );
      throw new ProviderError(classified.kind, classified.message, classified.code);
    }
  }
}

/** SES tag chars: A-Z a-z 0-9 - _ · max 256 chars each. Strip anything else. */
function sanitizeTag(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/** From-name: strip newlines and control chars to prevent header injection. */
function sanitizeFromName(s: string): string {
  return s.replace(/[\r\n]/g, " ").slice(0, 128);
}

function classifySesError(err: unknown): { kind: ProviderErrorKind; message: string; code?: string } {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  const code = e.name ?? e.Code;
  const status = e.$metadata?.httpStatusCode;
  const message = e.message ?? "SES send failed";

  if (code === "Throttling" || code === "TooManyRequestsException" || status === 429) {
    return { kind: "throttled", code, message };
  }
  if (code === "SendingPausedException") return { kind: "account_paused", code, message };
  if (code === "MailFromDomainNotVerifiedException" || code === "MessageRejected") {
    return { kind: "sender_denied", code, message };
  }
  if (code === "BadRequestException" || status === 400) {
    return { kind: "invalid_address", code, message };
  }
  if (status && status >= 500) return { kind: "transient", code, message };
  return { kind: "permanent", code, message };
}
