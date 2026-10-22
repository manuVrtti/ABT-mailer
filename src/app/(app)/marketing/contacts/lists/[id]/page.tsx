import { notFound } from "next/navigation";
import { ContactListKind, type Prisma } from "@prisma/client";
import { AlertTriangle, DatabaseZap, ListChecks, Users, Megaphone, Search, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Table, THead, TR, TH, TD, EmptyState, Button, Badge } from "@/components/ui";
import { describeKlymbFilter, klymbFilterSchema, USER_TYPES, USER_TYPE_LABELS } from "@/server/klymb/filter";
import type { KlymbSyncStats } from "@/server/klymb/sync";
import { KlymbOverridesPanel, RefreshKlymbButton } from "./_klymb-panel";
import { ContactsTabs } from "../../_tabs";
import { DeleteListButton } from "./_delete-button";
import { AddMembersPanel } from "./_add-members";
import { ImportCsvPanel } from "./_import-csv";
import { RemoveMemberButton } from "./_remove-member";
import { requireAccess } from "@/server/access/permissions";
import { canSeeKlymb, currentScope } from "@/server/access/scope";

export const dynamic = "force-dynamic";
// CSV imports and Klymb refreshes run as server actions on this route.
export const maxDuration = 120;

const ADDED = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

const LIST_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  teal: "bg-teal-400",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};

const TYPE_BADGE: Record<string, "success" | "info" | "warning" | "muted"> = {
  STUDENT: "success",
  PROFESSIONAL: "info",
  RECRUITER: "warning",
  UNKNOWN: "muted",
};

function formatAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `on ${d.toISOString().slice(0, 10)}`;
}

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string };
}) {
  await requireAccess("contacts.manage");
  const q = (searchParams.q ?? "").trim().slice(0, 200);
  // Every word must match the email, first name, last name or college, so
  // "jahanvi pratap" finds first "jahanvi" + last "pratap".
  const memberWhere: Prisma.ContactListMemberWhereInput = q
    ? {
        contact: {
          AND: q.split(/\s+/).map((term) => ({
            OR: (["email", "firstName", "lastName", "college"] as const).map((field) => ({
              [field]: { contains: term, mode: "insensitive" as const },
            })),
          })),
        },
      }
    : {};

  const [list, matchCount] = await Promise.all([
    db.contactList.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { members: true } },
        overrides: { orderBy: { createdAt: "desc" }, select: { email: true, mode: true } },
        members: {
          where: memberWhere,
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
                company: true,
                userType: true,
                graduationYear: true,
              },
            },
          },
        },
      },
    }),
    q ? db.contactListMember.count({ where: { listId: params.id, ...memberWhere } }) : Promise.resolve(0),
  ]);
  if (!list) notFound();

  const isKlymb = list.kind === ContactListKind.KLYMB;
  if (isKlymb && !canSeeKlymb(await currentScope())) notFound();
  const filter = isKlymb ? klymbFilterSchema.safeParse(list.klymbFilter) : null;
  const stats = (list.syncStats ?? null) as KlymbSyncStats | null;

  return (
    <div className="space-y-6">
      <ContactsTabs />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LIST_DOT[list.color] ?? LIST_DOT.slate}`} aria-hidden />
            <h1 className="truncate text-[22px] font-semibold leading-8 tracking-tight">{list.name}</h1>
          </div>
          {list.description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{list.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="muted">
              <Users className="h-3 w-3" /> {list._count.members.toLocaleString()} contacts
            </Badge>
            {isKlymb ? (
              <Badge tone={list.syncError ? "destructive" : "success"} dot>
                {list.syncError ? "Refresh failed" : "Live · Klymb database"}
              </Badge>
            ) : (
              <Badge tone="muted">Static list</Badge>
            )}
            {isKlymb && (
              <span className="inline-flex items-center gap-1">
                <DatabaseZap className="h-3.5 w-3.5" />
                {list.syncedAt ? `Refreshed ${formatAgo(list.syncedAt)}` : "Never refreshed"}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {isKlymb && (
            <>
              <RefreshKlymbButton listId={list.id} />
              <Button as="a" href={`/marketing/contacts/lists/${list.id}/filter`} variant="secondary">
                <SlidersHorizontal className="h-4 w-4" />
                Edit filter
              </Button>
            </>
          )}
          <DeleteListButton id={list.id} name={list.name} />
          <Button as="a" href={`/marketing/campaigns/new?listId=${list.id}`}>
            <Megaphone className="h-4 w-4" />
            Send campaign
          </Button>
        </div>
      </div>

      {isKlymb ? (
        <>
          {list.syncError && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                The last refresh failed: {list.syncError}. Members below are from the last successful refresh. Campaigns
                to this list won&apos;t send until a refresh succeeds.
              </span>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2">
              <div className="text-sm font-medium">Who this list includes</div>
              {filter?.success ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {describeKlymbFilter(filter.data).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-destructive">This list&apos;s filter is invalid — open “Edit filter” to fix it.</p>
              )}
              {stats && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {USER_TYPES.map((t) => (
                    <span key={t}>
                      {USER_TYPE_LABELS[t]}: <b className="tabular-nums text-foreground">{(stats.byType[t] ?? 0).toLocaleString()}</b>
                    </span>
                  ))}
                  <span>
                    Last refresh: +{stats.added} / −{stats.removed} in {(stats.ms / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
            </Card>
            <KlymbOverridesPanel listId={list.id} overrides={list.overrides} />
          </div>
        </>
      ) : (
        <>
          <ImportCsvPanel listId={list.id} />
          <AddMembersPanel listId={list.id} />
        </>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Members</h2>
            <p className="text-xs text-muted-foreground">
              {q ? (
                <>
                  {matchCount.toLocaleString()} match{matchCount === 1 ? "" : "es"} for “{q}”
                  {matchCount > 100 ? " — showing the most recent 100" : ""}.{" "}
                  <a
                    href={`/marketing/contacts/lists/${list.id}`}
                    className="text-emerald-700 hover:underline dark:text-emerald-300"
                  >
                    Clear
                  </a>
                </>
              ) : (
                <>
                  Showing the most recent {Math.min(100, list._count.members)}
                  {list._count.members > 100 ? ` of ${list._count.members.toLocaleString()}` : ""} contact
                  {list._count.members === 1 ? "" : "s"}.
                </>
              )}
            </p>
          </div>
          {list._count.members > 0 && (
            <form className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search name, email or college…"
                className="w-full rounded-lg border border-input bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900"
              />
            </form>
          )}
        </div>
        {q && list.members.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching members"
            description={`Nobody in this list matches “${q}”.`}
          />
        ) : list.members.length === 0 ? (
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
                {isKlymb ? (
                  <>
                    <TH>Type</TH>
                    <TH>College / company</TH>
                    <TH>Grad year</TH>
                  </>
                ) : (
                  <>
                    <TH>College</TH>
                    <TH>Branch</TH>
                    <TH>Year</TH>
                  </>
                )}
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
                  {isKlymb ? (
                    <>
                      <TD>
                        <Badge tone={TYPE_BADGE[m.contact.userType ?? "UNKNOWN"] ?? "muted"}>
                          {(m.contact.userType ?? "unknown").toLowerCase()}
                        </Badge>
                      </TD>
                      <TD>{(m.contact.userType === "STUDENT" ? m.contact.college : m.contact.company ?? m.contact.college) ?? "—"}</TD>
                      <TD>{m.contact.graduationYear ?? "—"}</TD>
                    </>
                  ) : (
                    <>
                      <TD>{m.contact.college ?? "—"}</TD>
                      <TD>{m.contact.branch ?? "—"}</TD>
                      <TD>{m.contact.year ?? "—"}</TD>
                    </>
                  )}
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{ADDED.format(m.addedAt)}</TD>
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
