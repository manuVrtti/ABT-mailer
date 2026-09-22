import { randomUUID } from "node:crypto";
import type { EmailProvider, ProviderSendPayload, ProviderSendResult } from "@/server/email/types";
import { logger } from "@/lib/logger";

/**
 * In-memory provider for local development and tests. Never touches the
 * network. Every send is recorded so tests can assert against it.
 */
export class MockProvider implements EmailProvider {
  readonly name = "mock";
  readonly sent: Array<ProviderSendPayload & { providerMessageId: string; sentAt: Date }> = [];

  async send(payload: ProviderSendPayload): Promise<ProviderSendResult> {
    const providerMessageId = `mock-${randomUUID()}`;
    this.sent.push({ ...payload, providerMessageId, sentAt: new Date() });
    logger.debug({ to: payload.to, subject: payload.subject, providerMessageId }, "mock.send");
    return { providerMessageId };
  }

  reset() {
    this.sent.length = 0;
  }
}
