import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/server/queue/verify";
import { refreshConversions } from "@/server/conversions/refresh";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * QStash-scheduled conversion refresh. Add a QStash schedule (hourly is
 * plenty):
 *
 *   POST {NEXT_PUBLIC_APP_URL}/api/qstash/conversions/refresh
 *
 * Reads Klymb read-only and rebuilds attributed_conversions in the mailer DB.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyQStashSignature(req, raw);
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await refreshConversions()) });
  } catch (err) {
    logger.error({ err }, "conversions.refresh_endpoint_failed");
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
