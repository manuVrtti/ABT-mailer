import Link from "next/link";
import { ListChecks, Plus, Search, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, Button, EmptyState } from "@/components/ui";
import { ContactsTabs } from "../_tabs";
import { listColorChip, listColorGradient } from "./_colors";
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

const control =
  "rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900";

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
          <Button as="a" href="/marketing/contacts/lists/new">
            <Plus className="mr-1 h-4 w-4" />
            New list
          </Button>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => {
            const grad = listColorGradient(l.color);
            const chip = listColorChip(l.color);
            return (
              <Link
                key={l.id}
                href={`/marketing/contacts/lists/${l.id}`}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/60"
              >
                <div className={`relative overflow-hidden bg-gradient-to-br ${grad} p-5 text-white`}>
                  <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/20" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{l.name}</div>
                      {l.description && (
                        <div className="mt-1 line-clamp-2 text-xs text-white/80">{l.description}</div>
                      )}
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
                      <ListChecks className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-semibold tabular-nums text-foreground">
                      {l._count.members.toLocaleString()}
                    </span>{" "}
                    contacts
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chip}`}>
                    {l.color}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
