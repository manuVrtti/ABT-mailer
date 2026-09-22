import { createHmac, timingSafeEqual } from "node:crypto";
import { EmailCategory } from "@prisma/client";
import { getServerEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/utils";

/**
 * Deterministic HMAC-signed unsubscribe tokens.
 *
 * Payload:  { e: <normalized_email>, c: <category>, cmp?: <campaign_id> }
 * Wire:     base64url(payload) + "." + base64url(hmac-sha256(payload))
 *
 * Why deterministic (vs JWT with iat/exp): the campaign launcher generates one
 * token per recipient at fan-out. For 100k recipients we don't want to burn
 * DB writes on tokens; a stable HMAC keyed by the app secret gives the same
 * safety property (cannot forge without the secret) without persistence, and
 * revocation is handled by rotating UNSUBSCRIBE_TOKEN_SECRET if ever needed.
 *
 * The token has no expiry — an unsubscribe link should keep working. If a link
 * leaks, the worst case is one person is unsubscribed, which is reversible by
 * an admin.
 */

interface UnsubscribeClaims {
  email: string;
  category: EmailCategory;
  campaignId?: string;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function createUnsubscribeToken(claims: UnsubscribeClaims): string {
  const env = getServerEnv();
  const payload = JSON.stringify({
    e: normalizeEmail(claims.email),
    c: claims.category,
    cmp: claims.campaignId,
  });
  const p64 = b64url(payload);
  const sig = createHmac("sha256", env.UNSUBSCRIBE_TOKEN_SECRET).update(p64).digest();
  return `${p64}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeClaims | null {
  try {
    const [p64, s64] = token.split(".");
    if (!p64 || !s64) return null;
    const env = getServerEnv();
    const expected = createHmac("sha256", env.UNSUBSCRIBE_TOKEN_SECRET).update(p64).digest();
    const provided = b64urlDecode(s64);
    if (expected.length !== provided.length) return null;
    if (!timingSafeEqual(expected, provided)) return null;
    const payload = JSON.parse(b64urlDecode(p64).toString("utf8"));
    if (!payload.e || !payload.c) return null;
    return {
      email: String(payload.e),
      category: payload.c as EmailCategory,
      campaignId: payload.cmp ? String(payload.cmp) : undefined,
    };
  } catch {
    return null;
  }
}

/** Absolute URL for a recipient's unsubscribe page. */
export function unsubscribeUrl(claims: UnsubscribeClaims): string {
  const env = getServerEnv();
  const token = createUnsubscribeToken(claims);
  return `${env.NEXT_PUBLIC_APP_URL}/unsubscribe?t=${encodeURIComponent(token)}`;
}
