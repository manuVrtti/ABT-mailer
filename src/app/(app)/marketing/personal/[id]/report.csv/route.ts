import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { rowActivity } from "@/server/direct-send/stats";
import { canSendAs, scopeForUser } from "@/server/access/scope";
import { hasPermission } from "@/server/access/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One line per email of a personal-mails batch: status, delivered / opened / clicked. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasPermission(session.user.role, "exports"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const send = await db.directSend.findUnique({ where: { id: params.id }, select: { name: true, fromEmail: true } });
  if (!send || !canSendAs(await scopeForUser(session.user.id, session.user.role), send.fromEmail)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await db.directSendRow.findMany({
    where: { directSendId: params.id },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true, email: true, name: true, subject: true, attachmentNames: true, emailJobId: true },
  });
  const activity = await rowActivity(rows.map((r) => r.emailJobId).filter((x): x is string => Boolean(x)));

  const header = ["row", "email", "name", "subject", "attachments", "status", "sent_at", "delivered_at", "opened", "opens", "first_opened_at", "clicked", "clicks", "first_clicked_at", "error"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const a = r.emailJobId ? activity.get(r.emailJobId) : undefined;
    lines.push(
      [
        String(r.rowNumber),
        r.email,
        r.name ?? "",
        r.subject,
        r.attachmentNames.join("; "),
        a?.status ?? "NOT_QUEUED",
        a?.sentAt?.toISOString() ?? "",
        a?.deliveredAt?.toISOString() ?? "",
        a?.openedAt ? "yes" : "no",
        String(a?.openCount ?? 0),
        a?.openedAt?.toISOString() ?? "",
        a?.clickedAt ? "yes" : "no",
        String(a?.clickCount ?? 0),
        a?.clickedAt?.toISOString() ?? "",
        a?.errorMessage ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const slug = send.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "personal-mails";
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: string): string {
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}
