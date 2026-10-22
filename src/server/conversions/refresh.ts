import { EmailEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { attribute, type Send } from "./attribute";
import { fetchKlymbActions } from "./klymb-actions";
import { ATTRIBUTION_WINDOW_DAYS } from "./kinds";

/**
 * Rebuild attributed_conversions from scratch:
 *   1. every campaign / personal-mail email sent in the last HORIZON days,
 *   2. what those people did in Klymb since the oldest of them (read-only),
 *   3. last-touch attribution within the window,
 *   4. replace the table in one transaction.
 * Writes only to the mailer database.
 */

const HORIZON_DAYS = 180;
const CHUNK = 1000;

export interface RefreshResult {
  sends: number;
  actions: number;
  conversions: number;
  ms: number;
  skipped?: "already_running";
}

export async function refreshConversions(): Promise<RefreshResult> {
  const started = Date.now();
  // One refresh at a time: a run that started in the last 3 minutes and
  // hasn't finished is assumed to still be going.
  const running = await db.conversionRun.findFirst({
    where: { finishedAt: null, error: null, startedAt: { gte: new Date(started - 3 * 60_000) } },
  });
  if (running) return { sends: 0, actions: 0, conversions: 0, ms: 0, skipped: "already_running" };

  const run = await db.conversionRun.create({ data: { windowDays: ATTRIBUTION_WINDOW_DAYS } });
  try {
    const horizon = new Date(started - HORIZON_DAYS * 86_400_000);
    const jobs = await db.emailJob.findMany({
      where: {
        sentAt: { gte: horizon },
        OR: [{ campaignId: { not: null } }, { directSendId: { not: null } }],
      },
      select: { id: true, recipientEmail: true, sentAt: true, campaignId: true, directSendId: true, fromEmail: true },
    });
    const clicks = new Map<string, Date[]>();
    for (let i = 0; i < jobs.length; i += 5000) {
      const ids = jobs.slice(i, i + 5000).map((j) => j.id);
      const ev = await db.emailEvent.findMany({
        where: { jobId: { in: ids }, type: EmailEventType.CLICK },
        select: { jobId: true, createdAt: true },
      });
      for (const e of ev) clicks.set(e.jobId!, [...(clicks.get(e.jobId!) ?? []), e.createdAt]);
    }
    const sends: Send[] = jobs.map((j) => ({
      jobId: j.id,
      email: j.recipientEmail,
      sentAt: j.sentAt!,
      campaignId: j.campaignId,
      directSendId: j.directSendId,
      fromEmail: j.fromEmail,
      clickTimes: clicks.get(j.id) ?? [],
    }));

    const emails = Array.from(new Set(sends.map((s) => s.email.toLowerCase())));
    const oldest = sends.reduce((m, s) => (s.sentAt < m ? s.sentAt : m), new Date(started));
    const actions = await fetchKlymbActions(emails, oldest);
    const credited = attribute(sends, actions, ATTRIBUTION_WINDOW_DAYS);

    const rows: Prisma.AttributedConversionCreateManyInput[] = credited.map((c) => ({
      campaignId: c.send.campaignId,
      directSendId: c.send.directSendId,
      emailJobId: c.send.jobId,
      fromEmail: c.send.fromEmail,
      email: c.action.email,
      kind: c.action.kind,
      ref: c.action.ref,
      label: c.action.label.slice(0, 300),
      actionAt: c.action.at,
      sentAt: c.send.sentAt,
      clicked: c.clicked,
    }));
    // Readers see either the old set or the new one, never a half-written table.
    await db.$transaction(
      async (tx) => {
        await tx.attributedConversion.deleteMany({});
        for (const data of chunk(rows, CHUNK)) await tx.attributedConversion.createMany({ data });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    const result = { sends: sends.length, actions: actions.length, conversions: rows.length, ms: Date.now() - started };
    await db.conversionRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), sends: result.sends, actions: result.actions, conversions: result.conversions },
    });
    logger.info(result, "conversions.refreshed");
    return result;
  } catch (err) {
    await db.conversionRun
      .update({ where: { id: run.id }, data: { finishedAt: new Date(), error: (err as Error).message.slice(0, 1000) } })
      .catch(() => {});
    logger.error({ err }, "conversions.refresh_failed");
    throw err;
  }
}

/** Refresh when the last successful run is older than `maxAgeMinutes` (or never ran). */
export async function ensureConversionsFresh(maxAgeMinutes: number): Promise<void> {
  const last = await lastConversionRun();
  if (last && Date.now() - last.finishedAt!.getTime() < maxAgeMinutes * 60_000) return;
  await refreshConversions().catch(() => {});
}

export async function lastConversionRun() {
  return db.conversionRun.findFirst({
    where: { finishedAt: { not: null }, error: null },
    orderBy: { finishedAt: "desc" },
  });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
