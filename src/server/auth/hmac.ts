import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 request signing for the internal transactional API.
 *
 * Caller (ABTalks main app):
 *   const ts = Math.floor(Date.now() / 1000).toString();
 *   const body = JSON.stringify(payload);
 *   const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
 *   headers: {
 *     'X-ABTalks-Timestamp': ts,
 *     'X-ABTalks-Signature': `v1=${sig}`,
 *   }
 *
 * Verifier:
 *   * rejects requests where timestamp is more than TOLERANCE seconds off
 *     (replay defense);
 *   * uses timingSafeEqual to compare signatures.
 */

const TOLERANCE_SECONDS = 300; // 5 minutes

export interface HmacVerifyResult {
  ok: boolean;
  reason?: "missing_headers" | "bad_signature_format" | "timestamp_skew" | "signature_mismatch" | "missing_secret";
}

export function signHmac(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyHmac(input: {
  secret: string | undefined;
  timestampHeader: string | null;
  signatureHeader: string | null;
  body: string;
  now?: () => number;
}): HmacVerifyResult {
  if (!input.secret) return { ok: false, reason: "missing_secret" };
  if (!input.timestampHeader || !input.signatureHeader) return { ok: false, reason: "missing_headers" };

  // Header format: "v1=<hex>"
  const match = /^v1=([a-f0-9]+)$/.exec(input.signatureHeader.trim());
  if (!match) return { ok: false, reason: "bad_signature_format" };
  const providedHex = match[1]!;

  const ts = Number(input.timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, reason: "timestamp_skew" };
  const nowSec = Math.floor((input.now?.() ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp_skew" };

  const expected = signHmac(input.secret, input.timestampHeader, input.body);
  const a = Buffer.from(providedHex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return { ok: false, reason: "signature_mismatch" };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}
