import { cache } from "react";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { listBrands } from "@/server/brands";
import { canSendAs, type SenderScope } from "./filters";

export * from "./filters";

/**
 * Sender access: which brands a person may send as and see data for.
 *
 * Admins and people with "All senders" see everything. Everyone else sees
 * only email sent from their brands' domains: campaigns, personal mails,
 * logs, analytics, conversions, exports and search — plus templates of their
 * brands and shared (brand-less) templates. Contacts, lists and segments are
 * shared by all brands.
 *
 * Email data is matched by the sender address's domain (fromEmail ends with
 * "@klymb.ai"), the same rule brandForAddress uses, so old campaigns whose
 * exact address was later removed from a brand still belong to it.
 */

/** The signed-in person's scope. Cached per request. */
export const currentScope = cache(async (): Promise<SenderScope> => {
  const user = await requireUser();
  return scopeForUser(user.id, user.role);
});

export async function scopeForUser(userId: string, role: Role): Promise<SenderScope> {
  const brands = await listBrands();
  if (role === Role.ADMIN) return { all: true, brands };
  const u = await db.user.findUnique({ where: { id: userId }, select: { allSenders: true, senderBrandKeys: true } });
  if (!u || u.allSenders) return { all: true, brands };
  const allowed = brands.filter((b) => u.senderBrandKeys.includes(b.key));
  return {
    all: false,
    brands: allowed,
    brandKeys: allowed.map((b) => b.key),
    domains: allowed.map((b) => b.domain.toLowerCase()),
  };
}

/** 404 instead of showing a record from another brand. */
export function requireVisible(scope: SenderScope, fromEmail: string | null | undefined): void {
  if (!fromEmail || !canSendAs(scope, fromEmail)) notFound();
}

