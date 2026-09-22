import type { EmailProvider } from "@/server/email/types";
import { MockProvider } from "@/server/email/providers/mock";
import { SESProvider } from "@/server/email/providers/ses";
import { getServerEnv } from "@/lib/env";

/**
 * Choose the email provider at runtime.
 *
 *   EMAIL_PROVIDER=mock  → in-memory (default in development if AWS keys are missing)
 *   EMAIL_PROVIDER=ses   → Amazon SES v2 (default when AWS keys are set)
 *
 * A singleton MockProvider is exported so tests can inspect .sent.
 */
export const mockProvider = new MockProvider();

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const override = process.env.EMAIL_PROVIDER?.toLowerCase();
  if (override === "mock") {
    cached = mockProvider;
    return cached;
  }
  if (override === "ses") {
    return (cached = buildSes());
  }

  // No explicit override — pick based on whether AWS creds are present.
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return (cached = buildSes());
  }
  cached = mockProvider;
  return cached;
}

function buildSes(): EmailProvider {
  const env = getServerEnv();
  return new SESProvider({
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });
}

/** Reset the cached provider — used in tests. */
export function __resetEmailProviderForTests() {
  cached = undefined;
  mockProvider.reset();
}
