import Link from "next/link";
import { Megaphone, ArrowRight, Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { CampaignStatus, Prisma } from "@prisma/client";
import { PageHeader, Badge, Button, EmptyState } from "@/components/ui";
import { DeleteCampaignButton } from "./_delete-campaign-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

const statusTone: Record<
  CampaignStatus,
  { badge: "muted" | "success" | "warning" | "destructive" | "info"; dot: string }
> = {
  DRAFT: { badge: "muted", dot: "bg-slate-400" },
  SCHEDULED: { badge: "info", dot: "bg-blue-500" },
  QUEUED: { badge: "info", dot: "bg-blue-500" },
  SENDING: { badge: "info", dot: "bg-emerald-500 animate-pulse" },
  PAUSED: { badge: "warning", dot: "bg-amber-500" },
  COMPLETED: { badge: "success", dot: "bg-emerald-500" },
  CANCELLED: { badge: "warning", dot: "bg-amber-500" },
  FAILED: { badge: "destructive", dot: "bg-red-500" },
};

const IN_FLIGHT: CampaignStatus[] = ["QUEUED", "SENDING", "PAUSED"];

// Filter tabs shown above the list. "sending" groups every in-flight state.
const FILTERS: { key: string; label: string; statuses?: CampaignStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", statuses: ["DRAFT"] },
  { key: "scheduled", label: "Scheduled", statuses: ["SCHEDULED"] },
  { key: "sending", label: "Sending", statuses: IN_FLIGHT },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED", "FAILED"] },
];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const active = FILTERS.find((f) => f.key === searchParams.status) ?? FILTERS[0]!;

  const where: Prisma.CampaignWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(active.statuses ? { status: { in: active.statuses } } : {}),
  };

  const [campaigns, grouped, totalCount] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        segment: { select: { name: true } },
        list: { select: { name: true } },
        template: { select: { name: true } },
      },
    }),
    db.campaign.groupBy({ by: ["status"], _count: { _all: true } }),
    db.campaign.count(),
  ]);

  const countByStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const filterCount = (statuses?: CampaignStatus[]) =>
    statuses ? statuses.reduce((n, s) => n + (countByStatus.get(s) ?? 0), 0) : totalCount;

  const hrefFor = (params: { q?: string; status?: string }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.status && params.status !== "all") sp.set("status", params.status);
    const s = sp.toString();
    return s ? `/marketing/campaigns?${s}` : "/marketing/campaigns";
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One-off and recurring marketing emails. Every send is filtered against suppression before touching the queue."
        icon={Megaphone}
        actions={<Button as="a" href="/marketing/campaigns/new">New campaign</Button>}
      />

      {totalCount === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create your first campaign — pick an audience, a template, and hit send."
          action={<Button as="a" href="/marketing/campaigns/new">Create campaign</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <form className="relative w-full md:max-w-sm" action="/marketing/campaigns">
              {active.key !== "all" && <input type="hidden" name="status" value={active.key} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search campaigns by name or subject…"
                className="w-full rounded-xl border border-input bg-white py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-slate-900"
              />
              {q && (
                <Link
                  href={hrefFor({ status: active.key })}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Link>
              )}
            </form>

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const selected = f.key === active.key;
                return (
                  <Link
                    key={f.key}
                    href={hrefFor({ q, status: f.key })}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "border border-border/60 bg-white text-muted-foreground hover:border-emerald-300 hover:text-foreground dark:bg-slate-900"
                    }`}
                  >
                    {f.label}
                    <span
                      className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                        selected ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"
                      }`}
                    >
                      {filterCount(f.statuses)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {campaigns.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching campaigns"
              description={q ? `Nothing matches “${q}” in ${active.label.toLowerCase()} campaigns.` : `No ${active.label.toLowerCase()} campaigns.`}
              action={
                <Button as="a" href="/marketing/campaigns" variant="secondary">
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
              <ul className="divide-y divide-border/60">
                {campaigns.map((c) => {
                  const tone = statusTone[c.status];
                  const rate = c.totalRecipients > 0 ? (c.deliveredCount / c.totalRecipients) * 100 : 0;
                  const blocked = IN_FLIGHT.includes(c.status)
                    ? `Cancel this ${c.status.toLowerCase()} campaign before deleting it`
                    : undefined;
                  return (
                    <li key={c.id} className="group flex items-center transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <Link
                        href={`/marketing/campaigns/${c.id}`}
                        className="grid min-w-0 flex-1 grid-cols-12 items-center gap-3 px-4 py-3"
                      >
                        <div className="col-span-5 flex min-w-0 items-center gap-3">
                          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{c.name}</div>
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {c.template?.name ?? "no template"} · {c.list?.name ?? c.segment?.name ?? "no audience"}
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2 text-right text-xs tabular-nums text-muted-foreground">
                          <span className="block text-[10px] uppercase tracking-wider">Recipients</span>
                          <span className="text-sm text-foreground">{c.totalRecipients.toLocaleString()}</span>
                        </div>

                        <div className="col-span-2 text-right text-xs tabular-nums text-muted-foreground">
                          <span className="block text-[10px] uppercase tracking-wider">Delivered</span>
                          <span className="text-sm text-foreground">
                            {c.deliveredCount.toLocaleString()}
                            {c.totalRecipients > 0 && (
                              <span className="ml-1 text-[10px] text-muted-foreground">({rate.toFixed(0)}%)</span>
                            )}
                          </span>
                        </div>

                        <div className="col-span-2 text-right text-xs tabular-nums text-muted-foreground">
                          <span className="block text-[10px] uppercase tracking-wider">Clicks</span>
                          <span className="text-sm text-foreground">{c.clickedCount.toLocaleString()}</span>
                        </div>

                        <div className="col-span-1 flex items-center justify-end gap-2">
                          <Badge tone={tone.badge}>{c.status}</Badge>
                          <ArrowRight className="hidden h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 lg:inline" />
                        </div>
                      </Link>
                      <div className="pr-3">
                        <DeleteCampaignButton id={c.id} name={c.name} blockedReason={blocked} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
