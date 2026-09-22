import { db } from "@/lib/db";
import { PageHeader, Card, Input, Label, Select, Button, Table, THead, TR, TH, TD, Badge, EmptyState } from "@/components/ui";
import { addManualSuppression, removeSuppression } from "./actions";
import { RemoveButton } from "./_remove-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppressions" };

export default async function SuppressionsPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim().toLowerCase();
  const rows = await db.suppression.findMany({
    where: q ? { email: { contains: q } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppressions"
        description="Emails that will not receive certain categories of mail. Hard bounces and complaints are added here automatically by SES events."
      />

      <Card>
        <div className="mb-2 text-sm font-medium">Add manual suppression</div>
        <form action={addManualSuppression} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue="MARKETING">
              <option value="MARKETING">Marketing</option>
              <option value="TRANSACTIONAL_NONESSENTIAL">Transactional (non-essential)</option>
              <option value="TRANSACTIONAL_ESSENTIAL">Transactional (essential)</option>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Label htmlFor="note">Note (optional)</Label>
            <Input id="note" name="note" placeholder="Requested via support ticket #123" />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button type="submit">Add suppression</Button>
          </div>
        </form>
      </Card>

      <div>
        <form className="mb-3 max-w-md">
          <Input name="q" placeholder="Search by email…" defaultValue={q ?? ""} />
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No suppressions" description="Nothing is currently suppressed." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Category</TH>
                <TH>Reason</TH>
                <TH>Note</TH>
                <TH>Added</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>{r.email}</TD>
                  <TD>
                    <Badge tone="muted">{r.category}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={r.reason === "HARD_BOUNCE" || r.reason === "COMPLAINT" ? "destructive" : "warning"}>
                      {r.reason}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-muted-foreground">{r.note ?? "—"}</TD>
                  <TD className="text-xs text-muted-foreground">
                    {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD className="text-right">
                    <RemoveButton id={r.id} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

// silence unused import warning in some TS configs
void removeSuppression;
