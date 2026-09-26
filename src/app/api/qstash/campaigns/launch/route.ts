import { NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyQStashSignature } from "@/server/queue/verify";
import { launchCampaignFanout } from "@/server/campaigns/launcher";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * QStash-scheduled campaign launcher. Configure a QStash cron schedule for
 * this URL that fires once a minute:
 *
 *   POST {NEXT_PUBLIC_APP_URL}/api/qstash/campaigns/launch
 *
 * The endpoint picks up SCHEDULED campaigns whose scheduledAt <= now,
 * transitions them to QUEUED, and fans out their recipients into the bulk
 * queue. Also marks anything stuck in QUEUED without startedAt as sending.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyQStashSignature(req, raw);
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const now = new Date();
  const due = await db.campaign.findMany({
    where: {
      status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.QUEUED] },
      scheduledAt: { lte: now },
      startedAt: null,
    },
    select: { id: true },
    take: 20,
  });

  const results: Array<{ id: string; enqueued?: number; skipped?: number; error?: string }> = [];
  for (const { id } of due) {
    try {
      await db.campaign.update({
        where: { id },
        data: { status: CampaignStatus.QUEUED },
      });
      // Short budget per campaign — big ones continue via /campaigns/fanout.
      const r = await launchCampaignFanout(id, { timeBudgetMs: 10_000 });
      results.push({ id, ...r });
    } catch (err) {
      logger.error({ err, campaignId: id }, "scheduled_launcher.failed");
      results.push({ id, error: (err as Error).message });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
