import { NextResponse } from "next/server";
import { z } from "zod";
import { ConversionStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyHmac } from "@/server/auth/hmac";
import { normalizeEmail } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  stage: z.enum(["CLICK", "REGISTRATION", "ASSESSMENT_STARTED", "ASSESSMENT_COMPLETED"]),
  email: z.string().email().optional(),
  registeredUserRefId: z.string().optional(),
  campaignSlug: z.string().min(1).optional(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

/**
 * ABTalks main → this endpoint. HMAC-signed with the same secret as the
 * transactional API. See docs/api/conversion.md.
 *
 * Attribution rules:
 *   1. If `campaignSlug` is provided, we link the conversion to that campaign.
 *   2. Otherwise we look up the last marketing email delivered to that email
 *      in the last 30 days and attribute to that campaign — a simple
 *      "last-touch" model.
 *   3. If nothing matches, we still record the ConversionEvent (unattributed)
 *      so no funnel data is dropped.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const verify = verifyHmac({
    secret: process.env.TRANSACTIONAL_API_HMAC_SECRET,
    timestampHeader: req.headers.get("x-abtalks-timestamp"),
    signatureHeader: req.headers.get("x-abtalks-signature"),
    body: raw,
  });
  if (!verify.ok) {
    logger.warn({ reason: verify.reason }, "conversions.auth.reject");
    return NextResponse.json({ error: "unauthorized", reason: verify.reason }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch (err) {
    return NextResponse.json({ error: "bad_body", detail: (err as Error).message }, { status: 400 });
  }

  const email = parsed.email ? normalizeEmail(parsed.email) : undefined;

  let campaignId: string | undefined;
  if (parsed.campaignSlug) {
    const c = await db.campaign.findUnique({ where: { slug: parsed.campaignSlug }, select: { id: true } });
    campaignId = c?.id;
  }
  if (!campaignId && email) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastMarketing = await db.emailJob.findFirst({
      where: {
        recipientEmail: email,
        emailType: "MARKETING",
        sentAt: { gte: thirtyDaysAgo },
        campaignId: { not: null },
      },
      orderBy: { sentAt: "desc" },
      select: { campaignId: true, campaign: { select: { slug: true } } },
    });
    campaignId = lastMarketing?.campaignId ?? undefined;
  }

  const contact = email
    ? await db.marketingContact.findUnique({ where: { email }, select: { id: true } })
    : null;

  const event = await db.conversionEvent.create({
    data: {
      stage: parsed.stage as ConversionStage,
      email,
      campaignId,
      campaignSlug: parsed.campaignSlug,
      contactId: contact?.id,
      registeredUserRefId: parsed.registeredUserRefId,
      occurredAt: parsed.occurredAt ? new Date(parsed.occurredAt) : new Date(),
      metadata: (parsed.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true, id: event.id, campaignId: campaignId ?? null });
}
