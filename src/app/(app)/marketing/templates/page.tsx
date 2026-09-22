import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing templates" };

export default async function MarketingTemplatesPage() {
  const templates = await db.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Marketing templates"
        description="Reusable email designs built with the drag-and-drop editor. Personalization uses {{first_name}} style tokens."
        actions={<Button as="a" href="/marketing/templates/new">New template</Button>}
      />
      {templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Design your first template with the visual editor."
          action={<Button as="a" href="/marketing/templates/new">Create template</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Subject</TH>
              <TH>Variables</TH>
              <TH>Updated</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {templates.map((t) => (
              <TR key={t.id}>
                <TD className="font-medium">{t.name}</TD>
                <TD>
                  <Badge tone="muted">{t.category}</Badge>
                </TD>
                <TD className="max-w-[320px] truncate text-muted-foreground">{t.subject}</TD>
                <TD className="text-xs text-muted-foreground">{t.variables.join(", ") || "—"}</TD>
                <TD className="text-xs text-muted-foreground">
                  {t.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                </TD>
                <TD className="text-right">
                  <Link href={`/marketing/templates/${t.id}`} className="text-xs underline underline-offset-4">
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
