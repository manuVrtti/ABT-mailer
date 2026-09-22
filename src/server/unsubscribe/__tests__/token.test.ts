import { describe, expect, it, beforeAll } from "vitest";
import { EmailCategory } from "@prisma/client";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/server/unsubscribe/token";

beforeAll(() => {
  // Minimum env required by getServerEnv() when unsubscribe/token calls it.
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
  process.env.NEXTAUTH_URL ??= "http://localhost:3000";
  process.env.NEXTAUTH_SECRET ??= "0123456789abcdef0123456789abcdef";
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/x";
  process.env.SES_FROM_EMAIL ??= "no-reply@mail.abtalks.in";
  process.env.SES_CONFIGURATION_SET ??= "abtalks-mailer";
  process.env.SNS_WEBHOOK_SECRET ??= "sns-secret-1234";
  process.env.TRANSACTIONAL_API_HMAC_SECRET ??= "hmac-secret-1234";
  process.env.UNSUBSCRIBE_TOKEN_SECRET ??= "unsub-secret-1234";
});

describe("unsubscribe token", () => {
  it("round-trips normalized email + category + campaignId", () => {
    const token = createUnsubscribeToken({
      email: "Alice@Example.COM",
      category: EmailCategory.MARKETING,
      campaignId: "cmp_123",
    });
    const claims = verifyUnsubscribeToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.email).toBe("alice@example.com");
    expect(claims!.category).toBe(EmailCategory.MARKETING);
    expect(claims!.campaignId).toBe("cmp_123");
  });

  it("is deterministic for the same inputs", () => {
    const a = createUnsubscribeToken({ email: "x@y.z", category: EmailCategory.MARKETING, campaignId: "c1" });
    const b = createUnsubscribeToken({ email: "x@y.z", category: EmailCategory.MARKETING, campaignId: "c1" });
    expect(a).toBe(b);
  });

  it("rejects a tampered payload", () => {
    const token = createUnsubscribeToken({ email: "x@y.z", category: EmailCategory.MARKETING });
    const [p, s] = token.split(".");
    const tampered = `${p}A.${s}`; // mutate payload
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a bad signature", () => {
    const token = createUnsubscribeToken({ email: "x@y.z", category: EmailCategory.MARKETING });
    const [p] = token.split(".");
    expect(verifyUnsubscribeToken(`${p}.abc`)).toBeNull();
  });
});
