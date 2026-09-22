import { db } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Input, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: { action?: string; user?: string };
}) {
  await requireRole([Role.ADMIN]);
  const rows = await db.auditLog.findMany({
    where: {
      ...(searchParams.action ? { action: { contains: searchParams.action } } : {}),
      ...(searchParams.user
        ? { user: { OR: [{ email: { contains: searchParams.user } }, { name: { contains: searchParams.user } }] } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every sensitive action taken in the app. Latest 200; use filters to narrow down."
      />
      <form className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input name="action" placeholder="Filter by action (e.g. campaign.send_now)" defaultValue={searchParams.action ?? ""} />
        <Input name="user" placeholder="Filter by user email…" defaultValue={searchParams.user ?? ""} />
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No audit rows match" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>User</TH>
              <TH>Action</TH>
              <TH>Resource</TH>
              <TH>Result</TH>
              <TH>Metadata</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </TD>
                <TD className="text-xs">{r.user?.email ?? "system"}</TD>
                <TD>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code>
                </TD>
                <TD className="max-w-[240px] truncate text-xs text-muted-foreground">{r.resource ?? "—"}</TD>
                <TD>
                  <Badge tone={r.result === "success" ? "success" : r.result === "failure" ? "destructive" : "muted"}>
                    {r.result ?? "—"}
                  </Badge>
                </TD>
                <TD className="max-w-[380px] truncate text-xs text-muted-foreground">
                  {r.metadata ? JSON.stringify(r.metadata) : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
