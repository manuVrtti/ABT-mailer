import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { scopeForUser } from "@/server/access/scope";
import { permissionsForRole } from "@/server/access/permissions";
import { bucketLabel } from "@/server/analytics/period";
import { analyticsReport, readAnalyticsParams, type Counts } from "@/server/analytics/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Analytics chart and month-by-month numbers for the same period and filters as the page. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const perms = await permissionsForRole(session.user.role);
  if (!perms.has("analytics.view") || !perms.has("exports"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const scope = await scopeForUser(session.user.id, session.user.role);
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { period, by, filters } = readAnalyticsParams(sp, scope);
  const r = await analyticsReport(scope, filters, period, by);

  const header = [
    "section",
    "period",
    "sent",
    "delivered",
    "opened",
    "clicked",
    "bounced",
    "spam_complaints",
  ];
  const line = (section: string, label: string, c: Counts) =>
    [section, label, c.sent, c.delivered, c.opened, c.clicked, c.bounced, c.complained]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  const lines = [
    header.join(","),
    line("total", `${period.fromDay} to ${period.toDay}`, r.totals),
    ...r.series.map((s) => line(by, bucketLabel(s.key, by), s)),
    ...(by === "month" ? [] : r.months.map((m) => line("month", bucketLabel(m.key, "month"), m))),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analytics-${period.fromDay}-to-${period.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
