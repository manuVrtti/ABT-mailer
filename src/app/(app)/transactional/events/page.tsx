import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState } from "@/components/ui";
import { ToggleRule } from "./_toggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event rules" };

export default async function EventRulesPage() {
  const rules = await db.emailEventRule.findMany({ orderBy: { eventType: "asc" } });

  return (
    <div>
      <PageHeader
        title="Event rules"
        description="Each rule maps an ABTalks event (like USER_REGISTERED) to a transactional template."
        actions={<Button as="a" href="/transactional/events/new">New rule</Button>}
      />
      {rules.length === 0 ? (
        <EmptyState
          title="No event rules yet"
          description="Create rules so events trigger emails automatically."
          action={<Button as="a" href="/transactional/events/new">Create rule</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Event</TH>
              <TH>Template</TH>
              <TH>Required variables</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {rules.map((r) => (
              <TR key={r.id}>
                <TD>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.eventType}</code>
                  {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
                </TD>
                <TD>
                  <Link href={`/transactional/templates/${encodeURIComponent(r.templateKey)}`} className="underline underline-offset-4">
                    {r.templateKey}
                  </Link>
                </TD>
                <TD className="text-xs text-muted-foreground">{r.requiredVars.join(", ") || "—"}</TD>
                <TD>
                  {r.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Disabled</Badge>}
                </TD>
                <TD className="whitespace-nowrap text-right">
                  <ToggleRule eventType={r.eventType} isActive={r.isActive} />
                  <Link
                    href={`/transactional/events/${encodeURIComponent(r.eventType)}`}
                    className="ml-3 text-xs underline underline-offset-4"
                  >
                    Edit
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
