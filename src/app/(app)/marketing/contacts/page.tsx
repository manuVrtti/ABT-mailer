import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState, Input } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string; college?: string };
}) {
  const q = searchParams.q?.trim().toLowerCase();
  const college = searchParams.college?.trim();
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const where = {
    ...(q ? { email: { contains: q } } : {}),
    ...(college ? { college: { equals: college } } : {}),
  };
  const [total, contacts] = await Promise.all([
    db.marketingContact.count({ where }),
    db.marketingContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        college: true,
        branch: true,
        year: true,
        registrationStatus: true,
        source: true,
        createdAt: true,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Contacts"
        description={`${total.toLocaleString()} contact${total === 1 ? "" : "s"}. Non-registered prospects only — registered ABTalks users sync separately.`}
        actions={
          <>
            <Button as="a" href="/marketing/contacts/imports" variant="secondary">
              Imports
            </Button>
            <Button as="a" href="/marketing/contacts/import">
              Import CSV
            </Button>
          </>
        }
      />

      <form className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input name="q" placeholder="Search by email…" defaultValue={q ?? ""} />
        <Input name="college" placeholder="Filter by college…" defaultValue={college ?? ""} />
        <div />
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          description="Upload a CSV to bring in students, or add one manually."
          action={<Button as="a" href="/marketing/contacts/import">Import CSV</Button>}
        />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Name</TH>
                <TH>College</TH>
                <TH>Branch</TH>
                <TH>Year</TH>
                <TH>Registration</TH>
                <TH>Source</TH>
              </TR>
            </THead>
            <tbody>
              {contacts.map((c) => (
                <TR key={c.id}>
                  <TD>{c.email}</TD>
                  <TD>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</TD>
                  <TD>{c.college ?? "—"}</TD>
                  <TD>{c.branch ?? "—"}</TD>
                  <TD>{c.year ?? "—"}</TD>
                  <TD>
                    {c.registrationStatus ? (
                      <Badge tone="info">{c.registrationStatus}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone="muted">{c.source}</Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  className="underline underline-offset-4"
                  href={{ pathname: "/marketing/contacts", query: { ...searchParams, page: page - 1 } }}
                >
                  Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  className="underline underline-offset-4"
                  href={{ pathname: "/marketing/contacts", query: { ...searchParams, page: page + 1 } }}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
