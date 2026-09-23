import Link from "next/link";
import { Filter, Users2, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const segments = await db.segment.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader
        title="Segments"
        icon={Filter}
        description="Saved audience filters. Reuse a segment across many campaigns instead of rebuilding the filter each time."
        actions={<Button as="a" href="/marketing/segments/new">New segment</Button>}
      />
      {segments.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No segments yet"
          description="Try 'AI Workshop attendees from ABES, 4th year, not registered' — filter now, reuse forever."
          action={<Button as="a" href="/marketing/segments/new">Create segment</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {segments.map((s) => (
            <Link
              key={s.id}
              href={`/marketing/segments/${s.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border/60 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900/60"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600 dark:from-indigo-950/40 dark:to-violet-950/30 dark:text-indigo-300">
                <Users2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                {s.description && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.description}</div>
                )}
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {s.audienceSize != null ? (
                    <>
                      Audience:{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {s.audienceSize.toLocaleString()}
                      </span>
                      {s.computedAt && (
                        <span className="ml-1 text-muted-foreground/70">
                          · updated {s.computedAt.toISOString().slice(0, 10)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Not computed yet — open to preview.</span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
