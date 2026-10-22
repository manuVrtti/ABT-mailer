import { Prisma } from "@prisma/client";
import type { BrandInfo } from "@/server/brands";

/**
 * Pure sender-access filters (no request, session or database access), so
 * server modules and tests can use them. The request-bound helpers —
 * currentScope, scopeForUser, requireVisible — live in ./scope.ts, which
 * re-exports everything here.
 */

export type SenderScope =
  | { all: true; brands: BrandInfo[] }
  | { all: false; brands: BrandInfo[]; brandKeys: string[]; domains: string[] };

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

export function canSendAs(scope: SenderScope, fromEmail: string): boolean {
  return scope.all || scope.domains.includes(domainOf(fromEmail));
}

/** Throws a readable error when the sender is outside the person's brands. */
export function assertSendAs(scope: SenderScope, fromEmail: string): void {
  if (!canSendAs(scope, fromEmail)) {
    throw new Error(`You don't have access to send as ${fromEmail}. Ask an admin to give you access to that sender.`);
  }
}

/** A Prisma where on a sender-address column ("fromEmail" on campaigns, jobs and batches). */
export function fromEmailWhere(scope: SenderScope): { OR: { fromEmail: Prisma.StringFilter }[] } | Record<string, never> {
  if (scope.all) return {};
  // No brands at all: match nothing.
  if (scope.domains.length === 0) return { OR: [{ fromEmail: { equals: "\u0000no-access" } }] };
  return { OR: scope.domains.map((d) => ({ fromEmail: { endsWith: `@${d}`, mode: "insensitive" as const } })) };
}

/** `AND <column> ILIKE ANY(...)` for raw SQL over a sender-address column; empty when unrestricted. */
export function fromEmailSql(scope: SenderScope, column: Prisma.Sql): Prisma.Sql {
  if (scope.all) return Prisma.empty;
  const patterns = scope.domains.length ? scope.domains.map((d) => `%@${d}`) : ["\u0000no-access"];
  return Prisma.sql` AND ${column} ILIKE ANY(${patterns}::text[])`;
}

/** Templates this person may see and use: their brands' plus shared ones. */
export function templateWhere(scope: SenderScope): Prisma.EmailTemplateWhereInput {
  if (scope.all) return {};
  return { OR: [{ brandKey: null }, { brandKey: { in: scope.brandKeys } }] };
}

export function canUseTemplate(scope: SenderScope, t: { brandKey: string | null }): boolean {
  return scope.all || t.brandKey === null || scope.brandKeys.includes(t.brandKey);
}

/** Shared templates change every brand's mail, so only people with all senders edit them. */
export function canEditTemplate(scope: SenderScope, t: { brandKey: string | null }): boolean {
  return scope.all || (t.brandKey !== null && scope.brandKeys.includes(t.brandKey));
}

/** Sender addresses this person can pick, verified brands only. */
export function sendableSenders(scope: SenderScope): { email: string; label: string; brandKey: string }[] {
  return scope.brands
    .filter((b) => b.sesVerified)
    .flatMap((b) => b.fromAddresses.map((email) => ({ email, label: `${b.fromName} <${email}>`, brandKey: b.key })));
}
