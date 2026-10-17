"use server";

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { refreshConversions } from "@/server/conversions/refresh";
import { goalSchema, type ConversionKind } from "@/server/conversions/kinds";
import { loadKlymbFilterOptions } from "@/server/klymb/options";

export type RefreshActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function refreshConversionsNow(): Promise<RefreshActionResult> {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  try {
    const r = await refreshConversions();
    revalidatePath("/marketing/analytics/conversions");
    revalidatePath("/dashboard");
    if (r.skipped) return { ok: true, message: "A refresh is already running — reload in a minute." };
    return { ok: true, message: `${r.conversions.toLocaleString()} conversions from ${r.actions.toLocaleString()} Klymb actions.` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type GoalOption = { kind: ConversionKind; ref?: string; label: string; count?: number };

/** What a campaign goal can be: any of a kind, or one specific event / cohort. Reads Klymb. */
export async function loadGoalOptions(): Promise<{ ok: true; options: GoalOption[] } | { ok: false; error: string }> {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  try {
    const o = await loadKlymbFilterOptions();
    const options: GoalOption[] = [
      { kind: "SIGNUP", label: "Signed up to Klymb" },
      { kind: "WORKSHOP", label: "Registered for any workshop" },
      ...o.workshops.map((w) => ({ kind: "WORKSHOP" as const, ref: w.id, label: `Registered for ${w.label}`, count: w.count })),
      { kind: "HACKATHON", label: "Registered for any hackathon" },
      ...o.hackathons.map((h) => ({ kind: "HACKATHON" as const, ref: h.id, label: `Registered for ${h.label}`, count: h.count })),
      { kind: "VIDEOTHON", label: "Registered for any VideoThon" },
      ...o.videothons.map((v) => ({ kind: "VIDEOTHON" as const, ref: v.id, label: `Registered for ${v.label}`, count: v.count })),
      { kind: "SUBMISSION", label: "Submitted a hackathon / VideoThon entry" },
      ...[...o.hackathons, ...o.videothons].map((h) => ({ kind: "SUBMISSION" as const, ref: h.id, label: `Submitted for ${h.label}` })),
      { kind: "COHORT", label: "Enrolled in any cohort" },
      ...o.cohorts.map((c) => ({ kind: "COHORT" as const, ref: c.id, label: `Enrolled in ${c.label}`, count: c.count })),
      { kind: "JOB", label: "Applied to a job" },
      { kind: "MOCK_INTERVIEW", label: "Took a mock interview" },
    ];
    return { ok: true, options };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function setCampaignGoal(campaignId: string, rawGoal: unknown): Promise<RefreshActionResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  let goal: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (rawGoal) {
    const parsed = goalSchema.safeParse(rawGoal);
    if (!parsed.success) return { ok: false, error: "Invalid goal" };
    goal = parsed.data as Prisma.InputJsonValue;
  }
  await db.campaign.update({ where: { id: campaignId }, data: { conversionGoal: goal } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "campaign.set_goal",
      resource: `campaign:${campaignId}`,
      metadata: rawGoal ? (rawGoal as Prisma.InputJsonValue) : { goal: null },
      result: "success",
    },
  });
  revalidatePath(`/marketing/campaigns/${campaignId}`);
  revalidatePath("/marketing/analytics/conversions");
  return { ok: true, message: rawGoal ? "Goal saved" : "Goal removed" };
}
