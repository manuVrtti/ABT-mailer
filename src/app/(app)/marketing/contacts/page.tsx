import Link from "next/link";
import { Users, Search, Upload, FolderClock } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Table, THead, TR, TH, TD, Badge, Button, EmptyState } from "@/components/ui";
import { ContactsTabs } from "./_tabs";

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
      <ContactsTabs />
      <PageHeader
        title="Contacts"
        icon={Users}
        description={
          <>
            <span className="font-semibold text-foreground">{total.toLocaleString()}</span>{" "}
            contact{total === 1 ? "" : "s"}. Non-registered prospects only — registered ABTalks users sync separately.
          </>
        }
        actions={
          <>
            <Button as="a" href="/marketing/contacts/imports" variant="secondary">
              <FolderClock className="mr-1 h-4 w-4" />
              Imports
            </Button>
            <Button as="a" href="/marketing/contacts/import">
              <Upload className="mr-1 h-4 w-4" />
              Import CSV
            </Button>
          </>
        }
      />

      <form className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by email…"
            className="w-full rounded-lg border border-input bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900"
          />
        </div>
        <input
          name="college"
          defaultValue={college ?? ""}
          placeholder="Filter by college…"
          className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900"
        />
        <div />
      </form>

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Upload a CSV to bring in students, or add one manually."
          action={
            <Button as="a" href="/marketing/contacts/import">
              <Upload className="mr-1 h-4 w-4" />
              Import CSV
            </Button>
          }
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
                  <TD className="font-medium">{c.email}</TD>
                  <TD className="text-muted-foreground">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                  </TD>
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
                  className="rounded-md border border-border bg-white px-2.5 py-1 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                  href={{ pathname: "/marketing/contacts", query: { ...searchParams, page: page - 1 } }}
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  className="rounded-md border border-border bg-white px-2.5 py-1 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                  href={{ pathname: "/marketing/contacts", query: { ...searchParams, page: page + 1 } }}
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
