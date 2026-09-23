import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, EmptyState, Button } from "@/components/ui";
import { ContactsTabs } from "../_tabs";
import type { ImportJobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import history" };

const statusTone: Record<ImportJobStatus, "muted" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "muted",
  PARSING: "info",
  VALIDATING: "info",
  IMPORTING: "info",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "warning",
};

export default async function ImportsPage() {
  const jobs = await db.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { createdBy: { select: { email: true } } },
  });

  return (
    <div>
      <ContactsTabs />
      <PageHeader
        title="Import history"
        description="Every CSV upload. Click a job to see rows, duplicates, and any failures."
        actions={<Button as="a" href="/marketing/contacts/import">New import</Button>}
      />
      {jobs.length === 0 ? (
        <EmptyState title="No imports yet" description="Upload a CSV to get started." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>File</TH>
              <TH>Status</TH>
              <TH>Rows</TH>
              <TH>Imported</TH>
              <TH>Duplicates</TH>
              <TH>Invalid</TH>
              <TH>Uploaded by</TH>
              <TH>When</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD>{j.filename}</TD>
                <TD>
                  <Badge tone={statusTone[j.status]}>{j.status}</Badge>
                </TD>
                <TD className="tabular-nums">{j.totalRows.toLocaleString()}</TD>
                <TD className="tabular-nums">{j.imported.toLocaleString()}</TD>
                <TD className="tabular-nums">{j.duplicates.toLocaleString()}</TD>
                <TD className="tabular-nums">{j.invalid.toLocaleString()}</TD>
                <TD className="text-xs text-muted-foreground">{j.createdBy?.email ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground">
                  {j.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </TD>
                <TD className="text-right">
                  <Link href={`/marketing/contacts/imports/${j.id}`} className="text-xs underline underline-offset-4">
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
