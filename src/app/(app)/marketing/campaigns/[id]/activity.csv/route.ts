import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/auth/session";
import { ACTIVITY_FILTERS, getRecipientActivity, type ActivityFilter } from "@/server/campaigns/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CSV of per-recipient opens/clicks for a campaign (same filters as the table). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(session.user.role, [Role.VIEWER])) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const campaign = await db.campaign.findUnique({ where: { id: params.id }, select: { slug: true } });
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const a = url.searchParams.get("activity") ?? "all";
  const filter: ActivityFilter = (ACTIVITY_FILTERS as readonly string[]).includes(a) ? (a as ActivityFilter) : "all";
  const search = url.searchParams.get("q") ?? "";

  const { rows } = await getRecipientActivity(params.id, { filter, search });

  const header = ["name", "email", "status", "delivered", "opens", "first_opened_at", "clicks", "links_clicked", "last_activity_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name ?? "",
        r.email,
        r.status,
        r.delivered ? "yes" : "no",
        String(r.opens),
        r.firstOpenAt?.toISOString() ?? "",
        String(r.clicks),
        r.links.join(" | "),
        r.lastActivityAt?.toISOString() ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const suffix = filter === "all" ? "" : `-${filter}`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-activity${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}
