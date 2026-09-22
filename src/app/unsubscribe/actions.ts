"use server";

import { redirect } from "next/navigation";
import { EmailCategory, SuppressionReason } from "@prisma/client";
import { db } from "@/lib/db";
import { addSuppression } from "@/server/email/suppression";
import { verifyUnsubscribeToken } from "@/server/unsubscribe/token";

export async function confirmUnsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const scope = String(formData.get("scope") ?? "marketing");
  const claims = await verifyUnsubscribeToken(token);
  if (!claims) redirect("/unsubscribe?error=invalid");

  const email = claims.email.toLowerCase();

  if (scope === "all") {
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.UNSUBSCRIBE, "user chose: all marketing + non-essential");
    await addSuppression(email, EmailCategory.TRANSACTIONAL_NONESSENTIAL, SuppressionReason.UNSUBSCRIBE, "user chose: all marketing + non-essential");
  } else {
    await addSuppression(email, EmailCategory.MARKETING, SuppressionReason.UNSUBSCRIBE, "user unsubscribed from marketing");
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
      metadata: { scope, campaignId: claims.campaignId ?? null },
      result: "success",
    },
  });

  redirect(`/unsubscribe/done?scope=${scope}`);
}
