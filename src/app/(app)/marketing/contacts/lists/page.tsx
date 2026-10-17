import Link from "next/link";
import { DatabaseZap, ListChecks, Plus, Search, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, Button, EmptyState, Badge } from "@/components/ui";
import { ContactsTabs } from "../_tabs";
import { CONTACT_LIST_COLORS } from "./_constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact lists" };

const SORTS = {
  newest: { label: "Newest first", orderBy: { createdAt: "desc" } },
  oldest: { label: "Oldest first", orderBy: { createdAt: "asc" } },
  name: { label: "Name A–Z", orderBy: { name: "asc" } },
  "name-desc": { label: "Name Z–A", orderBy: { name: "desc" } },
  largest: { label: "Most contacts", orderBy: { members: { _count: "desc" } } },
  smallest: { label: "Fewest contacts", orderBy: { members: { _count: "asc" } } },
} satisfies Record<string, { label: string; orderBy: Prisma.ContactListOrderByWithRelationInput }>;
type SortKey = keyof typeof SORTS;

const SIZES = {
  any: { label: "Any size", where: {} },
  empty: { label: "Empty lists", where: { members: { none: {} } } },
  "has-contacts": { label: "With contacts", where: { members: { some: {} } } },
} satisfies Record<string, { label: string; where: Prisma.ContactListWhereInput }>;
type SizeKey = keyof typeof SIZES;

const LIST_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  teal: "bg-teal-400",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};
const UPDATED = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

const control =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export default async function ContactListsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; color?: string; size?: string };
}) {
  const q = (searchParams.q ?? "").trim().slice(0, 200);
  const sort: SortKey =
    searchParams.sort && searchParams.sort in SORTS ? (searchParams.sort as SortKey) : "newest";
  const size: SizeKey =
    searchParams.size && searchParams.size in SIZES ? (searchParams.size as SizeKey) : "any";
  const color = (CONTACT_LIST_COLORS as readonly string[]).includes(searchParams.color ?? "")
    ? (searchParams.color as string)
    : "";
  const filtered = Boolean(q || color || size !== "any");

  const lists = await db.contactList.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        color ? { color } : {},
        SIZES[size].where,
      ],
    },
    orderBy: [SORTS[sort].orderBy, { createdAt: "desc" }],
    include: {
      _count: { select: { members: true } },
    },
  });

  return (
    <div>
      <ContactsTabs />
      <PageHeader
        title="Contact lists"
        icon={ListChecks}
        description="Named buckets of contacts — Candidates, Recruiters, Hackathon Participants, etc. A contact can belong to many lists."
        actions={
          <>
            <Button as="a" variant="secondary" href="/marketing/contacts/lists/new">
              <Plus className="mr-1 h-4 w-4" />
              New list
            </Button>
            <Button as="a" href="/marketing/contacts/lists/klymb/new">
              <DatabaseZap className="mr-1 h-4 w-4" />
              New Klymb list
            </Button>
          </>
        }
      />

      {(filtered || lists.length > 0) && (
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search lists by name or description…"
              className={`${control} w-full pl-9`}
            />
          </div>
          <select name="sort" defaultValue={sort} className={control} aria-label="Sort">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k].label}
              </option>
            ))}
          </select>
          <select name="color" defaultValue={color} className={control} aria-label="Colour">
            <option value="">All colours</option>
            {CONTACT_LIST_COLORS.map((c) => (
              <option key={c} value={c}>
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <select name="size" defaultValue={size} className={control} aria-label="Size">
            {(Object.keys(SIZES) as SizeKey[]).map((k) => (
              <option key={k} value={k}>
                {SIZES[k].label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {filtered && (
            <span className="text-xs text-muted-foreground">
              {lists.length} list{lists.length === 1 ? "" : "s"} match.{" "}
              <Link
                href={
                  sort === "newest" ? "/marketing/contacts/lists" : `/marketing/contacts/lists?sort=${sort}`
                }
                className="text-emerald-700 hover:underline dark:text-emerald-300"
              >
                Clear filters
              </Link>
            </span>
          )}
        </form>
      )}

      {filtered && lists.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching lists"
          description="No list matches this search and these filters."
        />
      ) : lists.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No lists yet"
          description="Create your first list — try 'Candidates', 'Recruiters', 'Hackathon Participants', 'Alumni'."
          action={
            <Button as="a" href="/marketing/contacts/lists/new">
              <Plus className="mr-1 h-4 w-4" />
              Create list
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => (
            <Link
              key={l.id}
              href={`/marketing/contacts/lists/${l.id}`}
              className="group flex flex-col rounded-lg border border-border bg-card p-4 shadow-card transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-muted-foreground group-hover:text-brand-600">
                  {l.kind === "KLYMB" ? <DatabaseZap className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${LIST_DOT[l.color] ?? LIST_DOT.slate}`} aria-hidden />
                    <span className="truncate font-medium">{l.name}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                    {l.description || (l.kind === "KLYMB" ? "Live list from the Klymb database." : "No description.")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-semibold tabular text-foreground">{l._count.members.toLocaleString()}</span>
                  contacts
                </span>
                {l.kind === "KLYMB" ? (
                  <Badge tone={l.syncError ? "destructive" : "success"} dot>
                    {l.syncError ? "Refresh failed" : "Live · Klymb"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Updated {UPDATED.format(l.updatedAt)}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
