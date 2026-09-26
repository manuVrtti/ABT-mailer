import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyQStashSignature } from "@/server/queue/verify";
import { launchCampaignFanout } from "@/server/campaigns/launcher";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  campaignId: z.string().min(1),
  afterContactId: z.string().min(1),
});

/**
 * QStash → continue a large campaign launch after `afterContactId`. The
 * launcher processes batches for ~40s, then publishes the next continuation.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQStashSignature(req, raw))) {
    logger.warn({ path: "/api/qstash/campaigns/fanout" }, "qstash.signature.invalid");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  try {
    const result = await launchCampaignFanout(body.campaignId, { afterContactId: body.afterContactId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, campaignId: body.campaignId }, "campaign.fanout.continuation_failed");
    // 5xx → QStash retries; every step of a batch is idempotent.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
