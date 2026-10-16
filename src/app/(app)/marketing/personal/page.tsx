import Link from "next/link";
import { DirectSendStatus, Role } from "@prisma/client";
import { Plus, Send } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Badge, Button, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { batchSummaries } from "@/server/direct-send/stats";

export const dynamic = "force-dynamic";
export const metadata = { title: "Personal mails" };

const TONE: Record<DirectSendStatus, "muted" | "info" | "success" | "warning"> = {
  DRAFT: "muted",
  SENDING: "info",
  COMPLETED: "success",
  CANCELLED: "warning",
};

function pct(n: number, of: number) {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "";
}

export default async function DirectSendsPage() {
  const user = await requireRole([Role.ADMIN, Role.MARKETER, Role.VIEWER]);
  const sends = await db.directSend.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, status: true, kind: true, totalRows: true, fromEmail: true, createdAt: true, _count: { select: { attachments: true } } },
  });
  const summaries = await batchSummaries(sends.map((s) => s.id));

  return (
    <div>
      <PageHeader
        title="Personal mails"
        icon={Send}
        description="A different email to each person — from a CSV of email, name, subject, body and attachments."
        actions={
          user.role !== Role.VIEWER && (
            <Button as="a" href="/marketing/personal/new">
              <Plus className="mr-1 h-4 w-4" /> New personal mails
            </Button>
          )
        }
      />
      {sends.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No personal mails yet"
          description="Upload a CSV where each row is one email — e.g. offer letters, certificates or interview invites, each with its own subject, body and file."
          action={
            user.role !== Role.VIEWER && (
              <Button as="a" href="/marketing/personal/new">
                <Plus className="mr-1 h-4 w-4" /> New personal mails
              </Button>
            )
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Batch</TH>
              <TH>Status</TH>
              <TH className="text-right">Emails</TH>
              <TH className="text-right">Sent</TH>
              <TH className="text-right">Opened</TH>
              <TH className="text-right">Clicked</TH>
              <TH className="text-right">Failed</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <tbody>
            {sends.map((s) => {
              const sum = summaries.get(s.id);
              return (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/marketing/personal/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {s.kind === "PERSONAL" ? "Personal" : "Promotional"} · {s.fromEmail}
                      {s._count.attachments > 0 && ` · ${s._count.attachments} file${s._count.attachments === 1 ? "" : "s"}`}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={TONE[s.status]}>{s.status}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{s.totalRows.toLocaleString()}</TD>
                  <TD className="text-right tabular-nums">{sum ? sum.sent.toLocaleString() : "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {sum ? (
                      <>
                        {sum.opened.toLocaleString()} <span className="text-xs text-muted-foreground">{pct(sum.opened, sum.sent)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {sum ? (
                      <>
                        {sum.clicked.toLocaleString()} <span className="text-xs text-muted-foreground">{pct(sum.clicked, sum.sent)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right tabular-nums">{sum?.failed ? <span className="text-red-700 dark:text-red-300">{sum.failed}</span> : "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{s.createdAt.toISOString().slice(0, 10)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
