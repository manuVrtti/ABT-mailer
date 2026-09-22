import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/server/queue/verify";
import { syncRegisteredUsers } from "@/server/abtalks/registered-users";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * QStash-scheduled ABTalks registered-users sync. Configure a cron for this
 * URL (e.g. every 15 minutes):
 *
 *   POST {NEXT_PUBLIC_APP_URL}/api/qstash/sync/registered-users
 *
 * Idempotent — runs a single pass with an incremental cursor. Safe to fire
 * repeatedly; a spike does no harm beyond DB load on the ABTalks read-only.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyQStashSignature(req, raw);
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  try {
    const outcome = await syncRegisteredUsers();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    logger.error({ err }, "registered_users_sync.endpoint_failed");
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
