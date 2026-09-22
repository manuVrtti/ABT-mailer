import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize an email for deduplication: trim, lowercase, strip surrounding whitespace. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Absolute URL builder that always uses NEXT_PUBLIC_APP_URL — never hardcode a domain. */
export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return new URL(path, base).toString();
}
