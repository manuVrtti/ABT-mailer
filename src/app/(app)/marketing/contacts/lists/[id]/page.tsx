import { notFound } from "next/navigation";
import { ListChecks, Users, Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Card, Table, THead, TR, TH, TD, EmptyState, Button } from "@/components/ui";
import { ContactsTabs } from "../../_tabs";
import { listColorChip, listColorGradient } from "../_colors";
import { DeleteListButton } from "./_delete-button";
import { AddMembersPanel } from "./_add-members";
import { RemoveMemberButton } from "./_remove-member";

export const dynamic = "force-dynamic";

export default async function ListDetailPage({ params }: { params: { id: string } }) {
  const list = await db.contactList.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { members: true } },
      members: {
        orderBy: { addedAt: "desc" },
        take: 100,
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              college: true,
              branch: true,
              year: true,
            },
          },
        },
      },
    },
  });
  if (!list) notFound();

  const grad = listColorGradient(list.color);
  const chip = listColorChip(list.color);

  return (
    <div className="space-y-6">
      <ContactsTabs />

      {/* Hero card matching the list's color */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-6 text-white shadow-md`}>
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">Contact list</div>
            <h1 className="mt-1 text-3xl font-semibold">{list.name}</h1>
            {list.description && <p className="mt-2 max-w-2xl text-sm text-white/90">{list.description}</p>}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs backdrop-blur">
              <Users className="h-3.5 w-3.5" />
              <span className="font-semibold tabular-nums">{list._count.members.toLocaleString()}</span>
              <span>contacts</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[10px] font-medium ${chip}`}>{list.color}</span>
            <Button as="a" href={`/marketing/campaigns/new?listId=${list.id}`} variant="secondary">
              <Megaphone className="mr-1 h-4 w-4" />
              Send campaign
            </Button>
            <DeleteListButton id={list.id} name={list.name} />
          </div>
        </div>
      </div>

      <AddMembersPanel listId={list.id} />

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="text-xs text-muted-foreground">
              Showing the most recent {Math.min(100, list._count.members)}
              {list._count.members > 100 ? ` of ${list._count.members.toLocaleString()}` : ""} contact
              {list._count.members === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
        {list.members.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No members yet"
            description="Add contacts by pasting emails above, or from any contact's detail page."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Name</TH>
                <TH>College</TH>
                <TH>Branch</TH>
                <TH>Year</TH>
                <TH>Added</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {list.members.map((m) => (
                <TR key={m.contactId}>
                  <TD className="font-medium">{m.contact.email}</TD>
                  <TD className="text-muted-foreground">
                    {[m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "—"}
                  </TD>
                  <TD>{m.contact.college ?? "—"}</TD>
                  <TD>{m.contact.branch ?? "—"}</TD>
                  <TD>{m.contact.year ?? "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{m.addedAt.toISOString().slice(0, 10)}</TD>
                  <TD className="text-right">
                    <RemoveMemberButton listId={list.id} contactId={m.contactId} />
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
