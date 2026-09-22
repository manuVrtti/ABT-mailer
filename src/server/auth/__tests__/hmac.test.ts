import { describe, expect, it } from "vitest";
import { signHmac, verifyHmac } from "@/server/auth/hmac";

const SECRET = "super-secret-key-abcdef";

describe("verifyHmac", () => {
  it("accepts a well-formed signed request", () => {
    const ts = "1700000000";
    const body = JSON.stringify({ hello: "world" });
    const sig = `v1=${signHmac(SECRET, ts, body)}`;
    const res = verifyHmac({
      secret: SECRET,
      timestampHeader: ts,
      signatureHeader: sig,
      body,
      now: () => 1700000010 * 1000, // 10s later
    });
    expect(res.ok).toBe(true);
  });

  it("rejects a stale timestamp beyond tolerance", () => {
    const ts = "1700000000";
    const body = "{}";
    const sig = `v1=${signHmac(SECRET, ts, body)}`;
    const res = verifyHmac({
      secret: SECRET,
      timestampHeader: ts,
      signatureHeader: sig,
      body,
      now: () => (1700000000 + 60 * 60) * 1000, // 1h later
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("timestamp_skew");
  });

  it("rejects a tampered body", () => {
    const ts = "1700000000";
    const body = JSON.stringify({ hello: "world" });
    const sig = `v1=${signHmac(SECRET, ts, body)}`;
    const res = verifyHmac({
      secret: SECRET,
      timestampHeader: ts,
      signatureHeader: sig,
      body: JSON.stringify({ hello: "evil" }),
      now: () => 1700000010 * 1000,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("signature_mismatch");
  });

  it("rejects missing headers", () => {
    const res = verifyHmac({ secret: SECRET, timestampHeader: null, signatureHeader: null, body: "" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("missing_headers");
  });

  it("rejects when secret is missing", () => {
    const res = verifyHmac({ secret: undefined, timestampHeader: "1", signatureHeader: "v1=abc", body: "" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("missing_secret");
  });

  it("rejects a wrong signature format", () => {
    const ts = "1700000000";
    const body = "{}";
    const res = verifyHmac({
      secret: SECRET,
      timestampHeader: ts,
      signatureHeader: "just-hex-no-prefix",
      body,
      now: () => 1700000010 * 1000,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("bad_signature_format");
  });
});
