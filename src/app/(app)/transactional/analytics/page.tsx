import { db } from "@/lib/db";
import { EmailJobStatus, EmailType } from "@prisma/client";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactional analytics" };

const KEYED_STATUSES: EmailJobStatus[] = ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED", "FAILED", "SKIPPED"];

export default async function TransactionalAnalyticsPage() {
  const grouped = await db.emailJob.groupBy({
    by: ["status"],
    where: { emailType: EmailType.TRANSACTIONAL },
    _count: { _all: true },
  });
  const counts = new Map<EmailJobStatus, number>(
    grouped.map((g) => [g.status, g._count._all]),
  );
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  const byEvent = await db.emailJob.groupBy({
    by: ["eventType"],
    where: { emailType: EmailType.TRANSACTIONAL, eventType: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { eventType: "desc" } },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactional analytics"
        description="Delivery reliability overview. Detailed drilldowns arrive with the analytics phase."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total triggered" value={total} />
        {KEYED_STATUSES.map((s) => (
          <Stat key={s} label={s} value={counts.get(s) ?? 0} />
        ))}
      </div>

      <section>
        <div className="mb-2 text-sm font-medium">Top events</div>
        <Card>
          {byEvent.length === 0 ? (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {byEvent.map((e) => (
                <li key={e.eventType ?? "none"} className="flex items-center justify-between">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{e.eventType ?? "—"}</code>
                  <span className="tabular-nums">{e._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
