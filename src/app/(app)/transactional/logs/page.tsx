import { db } from "@/lib/db";
import { EmailJobStatus, EmailType } from "@prisma/client";
import { PageHeader, Table, THead, TR, TH, TD, Badge, EmptyState, Input } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delivery logs" };

const statusTone: Record<EmailJobStatus, "muted" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "muted",
  QUEUED: "muted",
  SENDING: "info",
  SENT: "success",
  DELIVERED: "success",
  BOUNCED: "destructive",
  COMPLAINED: "destructive",
  FAILED: "destructive",
  SKIPPED: "warning",
};

export default async function DeliveryLogsPage({
  searchParams,
}: {
  searchParams: { q?: string; event?: string; template?: string; status?: string };
}) {
  const q = searchParams.q?.trim();
  const jobs = await db.emailJob.findMany({
    where: {
      emailType: EmailType.TRANSACTIONAL,
      ...(q ? { recipientEmail: { contains: q.toLowerCase() } } : {}),
      ...(searchParams.event ? { eventType: searchParams.event } : {}),
      ...(searchParams.template ? { templateKey: searchParams.template } : {}),
      ...(searchParams.status ? { status: searchParams.status as EmailJobStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      recipientEmail: true,
      eventType: true,
      templateKey: true,
      templateVersion: true,
      status: true,
      providerMessageId: true,
      createdAt: true,
      sentAt: true,
      errorCode: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Delivery logs"
        description="Latest 100 transactional deliveries. Filter by recipient, event, template, or status."
      />
      <form className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input name="q" placeholder="Recipient email…" defaultValue={q ?? ""} />
        <Input name="event" placeholder="Event type…" defaultValue={searchParams.event ?? ""} />
        <Input name="template" placeholder="Template key…" defaultValue={searchParams.template ?? ""} />
        <Input name="status" placeholder="Status (e.g. SENT)…" defaultValue={searchParams.status ?? ""} />
      </form>

      {jobs.length === 0 ? (
        <EmptyState title="No deliveries yet" description="Send a transactional email to see it here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Recipient</TH>
              <TH>Event</TH>
              <TH>Template</TH>
              <TH>Status</TH>
              <TH>Provider id</TH>
              <TH>Sent</TH>
            </TR>
          </THead>
          <tbody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD>{j.recipientEmail}</TD>
                <TD>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{j.eventType ?? "—"}</code>
                </TD>
                <TD className="text-xs">
                  {j.templateKey ? `${j.templateKey} · v${j.templateVersion ?? "?"}` : "—"}
                </TD>
                <TD>
                  <Badge tone={statusTone[j.status]}>{j.status}</Badge>
                  {j.errorCode && <div className="mt-1 text-[10px] text-destructive">{j.errorCode}</div>}
                </TD>
                <TD className="max-w-[220px] truncate font-mono text-[10px] text-muted-foreground">
                  {j.providerMessageId ?? "—"}
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {j.sentAt ? j.sentAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
