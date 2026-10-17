import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/auth/session";
import { KIND_LABELS, goalMatches, parseGoal, type ConversionKind } from "@/server/conversions/kinds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every conversion credited to this campaign. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(session.user.role, [Role.VIEWER])) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const campaign = await db.campaign.findUnique({ where: { id: params.id }, select: { slug: true, conversionGoal: true } });
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const goal = parseGoal(campaign.conversionGoal);
  const rows = await db.attributedConversion.findMany({ where: { campaignId: params.id }, orderBy: { actionAt: "asc" } });

  const header = ["email", "action_type", "action", "action_at", "email_sent_at", "hours_after_email", "clicked_first", "matches_goal"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        KIND_LABELS[r.kind as ConversionKind] ?? r.kind,
        r.label,
        r.actionAt.toISOString(),
        r.sentAt.toISOString(),
        ((r.actionAt.getTime() - r.sentAt.getTime()) / 3_600_000).toFixed(1),
        r.clicked ? "yes" : "no",
        goal ? (goalMatches(goal, r) ? "yes" : "no") : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-conversions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}
