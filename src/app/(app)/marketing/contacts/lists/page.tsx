import Link from "next/link";
import { ListChecks, Plus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, EmptyState } from "@/components/ui";
import { ContactsTabs } from "../_tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact lists" };

/** Return chip classes for the given color name. */
export function listColorChip(color: string) {
  const c = color || "emerald";
  const map: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    teal: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return map[c] ?? map.emerald!;
}

export function listColorGradient(color: string) {
  const c = color || "emerald";
  const map: Record<string, string> = {
    emerald: "from-emerald-500 to-teal-500",
    teal: "from-teal-500 to-cyan-500",
    sky: "from-sky-500 to-blue-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
    violet: "from-violet-500 to-purple-500",
    slate: "from-slate-500 to-slate-600",
  };
  return map[c] ?? map.emerald!;
}

export default async function ContactListsPage() {
  const lists = await db.contactList.findMany({
    orderBy: { createdAt: "desc" },
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

      {lists.length === 0 ? (
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
                      {l.description && <div className="mt-1 line-clamp-2 text-xs text-white/80">{l.description}</div>}
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
                      <ListChecks className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span className="font-semibold text-foreground tabular-nums">
                      {l._count.members.toLocaleString()}
                    </span>{" "}
                    contacts
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chip}`}>{l.color}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
