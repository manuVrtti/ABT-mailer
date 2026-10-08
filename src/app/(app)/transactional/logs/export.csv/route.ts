import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession, hasRole } from "@/lib/auth/session";
import { LOG_EVENT_LABEL, parseLogFilters, queryEmailLogs } from "@/server/logs/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ROWS = 10_000;

/** CSV of the Logs page with the same filters (first 10,000 rows). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(session.user.role, [Role.VIEWER])) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = parseLogFilters(sp);
  const { rows } = await queryEmailLogs({ ...f, before: undefined }, MAX_ROWS);

  const header = ["date_utc", "event", "recipient", "subject", "type", "from", "detail", "job_id"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.at.toISOString(), LOG_EVENT_LABEL[r.event], r.recipient, r.subject, r.kind, r.from, r.detail, r.jobId]
        .map(csvCell)
        .join(","),
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="email-logs-${f.fromDay}-to-${f.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}
