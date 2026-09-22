import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/options";
import { hasRole } from "@/lib/auth/session";
import type { Role } from "@prisma/client";

/**
 * API route guard. Returns a NextResponse (401/403) if the request is not
 * authorized; returns the session user otherwise.
 *
 * Usage:
 *   const guard = await guardApi(["ADMIN"]);
 *   if (guard instanceof NextResponse) return guard;
 *   const user = guard;
 */
export async function guardApi(requiredAny: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!hasRole(session.user.role, requiredAny)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session.user;
}
