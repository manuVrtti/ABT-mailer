import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * Server-side role gate. Redirects to /login on no-session and returns a
 * 403 page for authenticated-but-underprivileged users.
 *
 * Ordering of `Role` in Prisma: ADMIN < MARKETER < VIEWER (declaration order).
 * We check by explicit inclusion, not ordering, to avoid ambiguity.
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [Role.ADMIN]: [Role.ADMIN, Role.MARKETER, Role.VIEWER],
  [Role.MARKETER]: [Role.MARKETER, Role.VIEWER],
  [Role.VIEWER]: [Role.VIEWER],
};

export function hasRole(userRole: Role, requiredAny: Role[]): boolean {
  const effective = ROLE_HIERARCHY[userRole] ?? [];
  return requiredAny.some((r) => effective.includes(r));
}

export async function requireRole(requiredAny: Role[]) {
  const user = await requireUser();
  if (!hasRole(user.role, requiredAny)) redirect("/403");
  return user;
}
