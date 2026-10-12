"use server";

import { redirect } from "next/navigation";
import { EmailCategory, SuppressionReason } from "@prisma/client";
import { db } from "@/lib/db";
import { addSuppression } from "@/server/email/suppression";
import { verifyUnsubscribeToken } from "@/server/unsubscribe/token";
import { LEGACY_BRAND_KEY } from "@/server/brands";

export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const scope = String(formData.get("scope") ?? "marketing");
  const claims = await verifyUnsubscribeToken(token);
  if (!claims) redirect("/unsubscribe?error=invalid");

  const email = claims.email.toLowerCase();
  // Unsubscribing only leaves the brand whose email held the link. Links sent
  // before brands existed were all ABTalks mail.
  const brandKey = claims.brandKey ?? LEGACY_BRAND_KEY;

  if (scope === "all") {
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.UNSUBSCRIBE, "user chose: all marketing + non-essential", brandKey);
    await addSuppression(email, EmailCategory.TRANSACTIONAL_NONESSENTIAL, SuppressionReason.UNSUBSCRIBE, "user chose: all marketing + non-essential", brandKey);
  } else {
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.UNSUBSCRIBE, "user unsubscribed from marketing", brandKey);
  }

  if (claims.campaignId) {
    await db.campaign.update({
      where: { id: claims.campaignId },
      data: { unsubscribedCount: { increment: 1 } },
    }).catch(() => {});
  }

  await db.auditLog.create({
    data: {
      action: "unsubscribe.confirm",
      resource: `email:${email}`,
      metadata: { scope, brandKey, campaignId: claims.campaignId ?? null },
      result: "success",
    },
  });

  redirect(`/unsubscribe/done?scope=${scope}&b=${encodeURIComponent(brandKey)}`);
}
