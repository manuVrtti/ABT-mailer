import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge, Table, THead, TR, TH, TD, EmptyState } from "@/components/ui";
import type { ImportJobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const statusTone: Record<ImportJobStatus, "muted" | "success" | "warning" | "destructive" | "info"> = {
  PENDING: "muted",
  PARSING: "info",
  VALIDATING: "info",
  IMPORTING: "info",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "warning",
};

export default async function ImportDetailPage({ params }: { params: { id: string } }) {
  const job = await db.importJob.findUnique({
    where: { id: params.id },
    include: { createdBy: { select: { email: true } }, errors: { orderBy: { rowNumber: "asc" }, take: 100 } },
  });
  if (!job) notFound();

  const inProgress = ["PENDING", "PARSING", "VALIDATING", "IMPORTING"].includes(job.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.filename}
        description={
          <>
            Status: <Badge tone={statusTone[job.status]}>{job.status}</Badge>
            {" · "}
            Uploaded by {job.createdBy?.email ?? "—"} on {job.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </>
        }
      />

      {inProgress && (
        <Card>
          <p className="text-sm text-muted-foreground">
            Import in progress. This page auto-refreshes every 4 seconds.
          </p>
          <meta httpEquiv="refresh" content="4" />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Rows" value={job.totalRows} />
        <Stat label="Processed" value={job.processed} />
        <Stat label="Imported" value={job.imported} tone="success" />
        <Stat label="Duplicates" value={job.duplicates} tone="warning" />
        <Stat label="Invalid" value={job.invalid} tone="destructive" />
      </div>

      {job.error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <div className="text-xs font-medium text-destructive">Import failed</div>
          <div className="mt-1 text-sm">{job.error}</div>
        </Card>
      )}

      <section>
        <div className="mb-2 text-sm font-medium">Row errors {job.errors.length > 0 && `(showing first 100)`}</div>
        {job.errors.length === 0 ? (
          <EmptyState title="No row-level errors" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Row</TH>
                <TH>Reason</TH>
                <TH>Data</TH>
              </TR>
            </THead>
            <tbody>
              {job.errors.map((e) => (
                <TR key={e.id}>
                  <TD>{e.rowNumber}</TD>
                  <TD className="text-xs text-destructive">{e.reason}</TD>
                  <TD className="max-w-[500px] truncate text-xs text-muted-foreground">
                    {JSON.stringify(e.rowData)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "destructive";
}) {
  const color =
    tone === "success"
      ? "text-green-700 dark:text-green-300"
      : tone === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "destructive"
      ? "text-destructive"
      : "";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
