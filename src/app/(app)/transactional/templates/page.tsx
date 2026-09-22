import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactional templates" };

export default async function TransactionalTemplatesPage() {
  // One row per templateKey — pick the active version, fall back to newest.
  const templates = await db.transactionalTemplate.findMany({
    orderBy: [{ templateKey: "asc" }, { version: "desc" }],
  });
  const byKey = new Map<string, (typeof templates)[number]>();
  for (const t of templates) {
    const existing = byKey.get(t.templateKey);
    if (!existing) byKey.set(t.templateKey, t);
    else if (t.isActive && !existing.isActive) byKey.set(t.templateKey, t);
  }
  const rows = [...byKey.values()];

  return (
    <div>
      <PageHeader
        title="Transactional templates"
        description="Emails automatically triggered by ABTalks events. Every change creates a new immutable version."
        actions={<Button as="a" href="/transactional/templates/new">New template</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No transactional templates yet"
          description="Create your first template — welcome_email, password_reset, etc."
          action={<Button as="a" href="/transactional/templates/new">Create template</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Template key</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Active version</TH>
              <TH>Variables</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {rows.map((t) => (
              <TR key={t.templateKey}>
                <TD>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.templateKey}</code>
                </TD>
                <TD>{t.name}</TD>
                <TD>
                  <Badge tone={t.category === "TRANSACTIONAL_ESSENTIAL" ? "info" : "muted"}>
                    {t.category === "TRANSACTIONAL_ESSENTIAL" ? "Essential" : "Non-essential"}
                  </Badge>
                </TD>
                <TD>
                  {t.isActive ? (
                    <Badge tone="success">v{t.version}</Badge>
                  ) : (
                    <Badge tone="warning">v{t.version} (inactive)</Badge>
                  )}
                </TD>
                <TD className="text-xs text-muted-foreground">{t.variables.join(", ") || "—"}</TD>
                <TD className="text-right">
                  <Link href={`/transactional/templates/${encodeURIComponent(t.templateKey)}`} className="text-xs underline underline-offset-4">
                    Open
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
