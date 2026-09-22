import { describe, expect, it } from "vitest";
import { marketingIdempotencyKey, transactionalIdempotencyKey } from "@/server/email/idempotency";

describe("idempotency keys", () => {
  it("marketing key is stable for the same (campaignId, email)", () => {
    const a = marketingIdempotencyKey("cmp_1", "Alice@Example.com");
    const b = marketingIdempotencyKey("cmp_1", "alice@example.com");
    expect(a).toBe(b);
    expect(a.startsWith("mkt_")).toBe(true);
  });

  it("marketing key differs for different campaigns", () => {
    const a = marketingIdempotencyKey("cmp_1", "x@example.com");
    const b = marketingIdempotencyKey("cmp_2", "x@example.com");
    expect(a).not.toBe(b);
  });

  it("transactional key is stable for the same (eventId, templateKey, email)", () => {
    const a = transactionalIdempotencyKey("evt_1", "welcome_email", "  Foo@Bar.com  ");
    const b = transactionalIdempotencyKey("evt_1", "welcome_email", "foo@bar.com");
    expect(a).toBe(b);
    expect(a.startsWith("txn_")).toBe(true);
  });

  it("transactional key differs when template differs", () => {
    const a = transactionalIdempotencyKey("evt_1", "welcome_email", "x@example.com");
    const b = transactionalIdempotencyKey("evt_1", "password_reset", "x@example.com");
    expect(a).not.toBe(b);
  });
});
