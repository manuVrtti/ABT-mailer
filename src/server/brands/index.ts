import { db } from "@/lib/db";

/**
 * Sending brands (Klymb, ABTalks, …). Each is one SES-verified domain with a
 * set of allowed From addresses. A job's brand is never stored: it is the
 * brand whose domain matches the job's From address, so every existing job
 * and campaign already has one.
 *
 * With no rows in `brands`, the env sender (SES_FROM_EMAIL / SES_FROM_NAME)
 * is the one and only brand, which is exactly how the app behaved before.
 */

export type BrandInfo = {
  key: string;
  name: string;
  domain: string;
  fromName: string;
  fromAddresses: string[];
  replyTo: string | null;
  websiteUrl: string | null;
  isDefault: boolean;
  sesVerified: boolean;
};

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/** The brand implied by the env sender — used until brands are configured. */
export function envBrand(): BrandInfo {
  const fromEmail = (process.env.SES_FROM_EMAIL ?? "").toLowerCase();
  const domain = domainOf(fromEmail);
  return {
    key: domain.split(".")[0] || "default",
    name: process.env.SES_FROM_NAME || "ABTalks",
    domain,
    fromName: process.env.SES_FROM_NAME || "ABTalks",
    fromAddresses: fromEmail ? [fromEmail] : [],
    replyTo: process.env.SES_REPLY_TO || null,
    websiteUrl: null,
    isDefault: true,
    // The env sender is what production has always sent from.
    sesVerified: true,
  };
}

/** Pure: the brand for an address among `brands`, else the default one. */
export function pickBrand(brands: BrandInfo[], email: string | null | undefined): BrandInfo {
  const d = email ? domainOf(email) : "";
  return (
    brands.find((b) => b.domain === d) ??
    brands.find((b) => b.isDefault) ??
    brands[0] ??
    envBrand()
  );
}

/**
 * Pure: the brand that may send as `email` — its domain belongs to a brand
 * that SES has verified (SES verifies the whole domain, so any address on it
 * works; `fromAddresses` is only the list offered in the UI). Null if none.
 */
export function senderBrand(brands: BrandInfo[], email: string): BrandInfo | null {
  const d = domainOf(email);
  return brands.find((b) => b.domain === d && b.sesVerified) ?? null;
}

/** Brand.key for unsubscribe links made before brands existed (all ABTalks mail). */
export const LEGACY_BRAND_KEY = "abtalks";

const TTL_MS = 30_000;
let cache: { at: number; brands: BrandInfo[] } | null = null;

export function clearBrandCache(): void {
  cache = null;
}

export async function listBrands(): Promise<BrandInfo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.brands;
  const rows = await db.brand.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  const brands: BrandInfo[] = rows.length
    ? rows.map((r) => ({
        key: r.key,
        name: r.name,
        domain: r.domain.toLowerCase(),
        fromName: r.fromName,
        fromAddresses: r.fromAddresses.map((a) => a.toLowerCase()),
        replyTo: r.replyTo,
        websiteUrl: r.websiteUrl,
        isDefault: r.isDefault,
        sesVerified: r.sesVerified,
      }))
    : [envBrand()];
  cache = { at: Date.now(), brands };
  return brands;
}

export async function brandForAddress(email: string | null | undefined): Promise<BrandInfo> {
  return pickBrand(await listBrands(), email);
}

/** The brand with this key (old links: LEGACY_BRAND_KEY), else the default. */
export async function brandByKey(key: string | undefined): Promise<BrandInfo> {
  const brands = await listBrands();
  const k = key || LEGACY_BRAND_KEY;
  return brands.find((b) => b.key === k) ?? pickBrand(brands, null);
}

export async function defaultBrand(): Promise<BrandInfo> {
  return pickBrand(await listBrands(), null);
}
