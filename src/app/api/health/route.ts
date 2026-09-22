import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe. Returns { ok: true } and a DB round-trip.
 * Exposes NO configuration; used by uptime pings and deployment smoke tests.
 */
export async function GET() {
  const started = Date.now();
  let db_ok = false;
  try {
    await db.$queryRaw`SELECT 1`;
    db_ok = true;
  } catch {
    db_ok = false;
  }
  return NextResponse.json({ ok: db_ok, db_ms: Date.now() - started });
}
