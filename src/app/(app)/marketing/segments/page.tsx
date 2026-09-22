import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const segments = await db.segment.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Segments"
        description="Saved audience filters. Reuse a segment across many campaigns instead of rebuilding the filter each time."
        actions={<Button as="a" href="/marketing/segments/new">New segment</Button>}
      />
      {segments.length === 0 ? (
        <EmptyState
          title="No segments yet"
          description="Create one — for example, 4th-year students at a specific college who haven't registered."
          action={<Button as="a" href="/marketing/segments/new">Create segment</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Audience</TH>
              <TH>Last computed</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {segments.map((s) => (
              <TR key={s.id}>
                <TD>
                  <div className="font-medium">{s.name}</div>
                  {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                </TD>
                <TD className="tabular-nums">{(s.audienceSize ?? 0).toLocaleString()}</TD>
                <TD className="text-xs text-muted-foreground">
                  {s.computedAt ? s.computedAt.toISOString().slice(0, 16).replace("T", " ") : "—"}
                </TD>
                <TD className="text-right">
                  <Link href={`/marketing/segments/${s.id}`} className="text-xs underline underline-offset-4">
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
