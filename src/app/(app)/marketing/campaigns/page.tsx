import Link from "next/link";
import { Megaphone, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import type { CampaignStatus } from "@prisma/client";
import { PageHeader, Badge, Button, EmptyState } from "@/components/ui";

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

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { segment: { select: { name: true } }, template: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One-off and recurring marketing emails. Every send is filtered against suppression before touching the queue."
        icon={Megaphone}
        actions={<Button as="a" href="/marketing/campaigns/new">New campaign</Button>}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create your first campaign — pick an audience, a template, and hit send."
          action={<Button as="a" href="/marketing/campaigns/new">Create campaign</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
          <ul className="divide-y divide-border/60">
            {campaigns.map((c) => {
              const tone = statusTone[c.status];
              const rate = c.totalRecipients > 0 ? (c.deliveredCount / c.totalRecipients) * 100 : 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/marketing/campaigns/${c.id}`}
                    className="group grid grid-cols-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="col-span-5 flex min-w-0 items-center gap-3">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {c.template?.name ?? "no template"} · {c.segment?.name ?? "no segment"}
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
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
