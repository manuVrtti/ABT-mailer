import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, Button, Table, THead, TR, TH, TD } from "@/components/ui";
import { TemplateForm } from "../_template-form";
import { ActivateButton } from "./_activate-button";
import { TestSendPanel } from "./_test-send";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: { key: string } }) {
  const templateKey = decodeURIComponent(params.key);
  const versions = await db.transactionalTemplate.findMany({
    where: { templateKey },
    orderBy: { version: "desc" },
  });
  if (versions.length === 0) notFound();

  const active = versions.find((v) => v.isActive) ?? versions[0]!;

  return (
    <div className="space-y-8">
      <PageHeader
        title={active.name}
        description={
          <>
            Template key: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{templateKey}</code>
            {" · "}
            <Badge tone={active.category === "TRANSACTIONAL_ESSENTIAL" ? "info" : "muted"}>
              {active.category === "TRANSACTIONAL_ESSENTIAL" ? "Essential" : "Non-essential"}
            </Badge>
          </>
        }
        actions={<Button as="a" href="/transactional/templates" variant="secondary">All templates</Button>}
      />

      <section>
        <div className="mb-2 text-sm font-medium">Versions</div>
        <Table>
          <THead>
            <TR>
              <TH>Version</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH>Variables</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {versions.map((v) => (
              <TR key={v.id}>
                <TD>v{v.version}</TD>
                <TD>
                  {v.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="muted">Inactive</Badge>}
                </TD>
                <TD className="text-xs text-muted-foreground">{v.createdAt.toISOString().slice(0, 16).replace("T", " ")}</TD>
                <TD className="text-xs text-muted-foreground">{v.variables.join(", ") || "—"}</TD>
                <TD className="text-right">
                  {!v.isActive && <ActivateButton templateKey={templateKey} version={v.version} />}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </section>

      <section>
        <div className="mb-2 text-sm font-medium">Test send</div>
        <TestSendPanel templateKey={templateKey} declaredVars={active.variables} />
      </section>

      <section>
        <div className="mb-2 text-sm font-medium">Create a new version</div>
        <TemplateForm
          initial={{
            templateKey,
            name: active.name,
            subject: active.subject,
            html: active.html,
            text: active.text,
            // Transactional templates only carry the two transactional categories.
            category:
              active.category === "TRANSACTIONAL_ESSENTIAL"
                ? "TRANSACTIONAL_ESSENTIAL"
                : "TRANSACTIONAL_NONESSENTIAL",
          }}
        />
      </section>

      <section>
        <div className="mb-2 text-sm font-medium">Active preview (rendered without variables)</div>
        <Card>
          <div className="text-xs text-muted-foreground">Subject</div>
          <div className="mb-3 text-sm">{active.subject}</div>
          <div className="text-xs text-muted-foreground">HTML</div>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{active.html}</pre>
        </Card>
      </section>
    </div>
  );
}
