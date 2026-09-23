import Link from "next/link";
import {
  Users,
  UserCheck,
  UserPlus,
  Send,
  Truck,
  MousePointerClick,
  AlertTriangle,
  TrendingUp,
  Megaphone,
  Upload,
  Filter,
  Palette,
  ArrowRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { CampaignStatus, EmailJobStatus, EmailType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const statusTone: Record<
  CampaignStatus,
  { badge: "muted" | "success" | "warning" | "destructive" | "info"; dot: string }
> = {
  DRAFT: { badge: "muted", dot: "bg-slate-400" },
  SCHEDULED: { badge: "info", dot: "bg-blue-500" },
  QUEUED: { badge: "info", dot: "bg-blue-500" },
  SENDING: { badge: "info", dot: "bg-indigo-500 animate-pulse" },
  PAUSED: { badge: "warning", dot: "bg-amber-500" },
  COMPLETED: { badge: "success", dot: "bg-emerald-500" },
  CANCELLED: { badge: "warning", dot: "bg-amber-500" },
  FAILED: { badge: "destructive", dot: "bg-red-500" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const [
    contactCount,
    registeredCount,
    marketingSentAgg,
    marketingDeliveredAgg,
    marketingClickedAgg,
    marketingBouncedAgg,
    recentCampaigns,
    conversionCount,
  ] = await Promise.all([
    db.marketingContact.count(),
    db.registeredUserRef.count(),
    db.emailJob.count({
      where: { emailType: EmailType.MARKETING, status: { in: [EmailJobStatus.SENT, EmailJobStatus.DELIVERED] } },
    }),
    db.campaign.aggregate({ _sum: { deliveredCount: true } }),
    db.campaign.aggregate({ _sum: { clickedCount: true } }),
    db.campaign.aggregate({ _sum: { bouncedCount: true } }),
    db.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        deliveredCount: true,
        clickedCount: true,
      },
    }),
    db.conversionEvent.count({ where: { stage: "REGISTRATION" } }),
  ]);

  const delivered = marketingDeliveredAgg._sum.deliveredCount ?? 0;
  const clicked = marketingClickedAgg._sum.clickedCount ?? 0;
  const bounced = marketingBouncedAgg._sum.bouncedCount ?? 0;
  const deliveryRate = marketingSentAgg > 0 ? (delivered / marketingSentAgg) * 100 : 0;
  const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;
  const bounceRate = marketingSentAgg > 0 ? (bounced / marketingSentAgg) * 100 : 0;
  const firstName = (user.name ?? user.email ?? "there").split(/\s+|@/)[0] ?? "there";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stats = [
    {
      label: "Total contacts",
      value: contactCount,
      icon: Users,
      gradient: "from-indigo-500 to-violet-500",
      surface: "bg-indigo-50 dark:bg-indigo-950/30",
      accent: "text-indigo-600 dark:text-indigo-300",
    },
    {
      label: "Registered users",
      value: registeredCount,
      icon: UserCheck,
      gradient: "from-sky-500 to-cyan-500",
      surface: "bg-sky-50 dark:bg-sky-950/30",
      accent: "text-sky-600 dark:text-sky-300",
    },
    {
      label: "Prospects",
      value: Math.max(0, contactCount - registeredCount),
      icon: UserPlus,
      gradient: "from-amber-500 to-orange-500",
      surface: "bg-amber-50 dark:bg-amber-950/30",
      accent: "text-amber-600 dark:text-amber-300",
    },
    {
      label: "Emails sent",
      value: marketingSentAgg,
      icon: Send,
      gradient: "from-emerald-500 to-teal-500",
      surface: "bg-emerald-50 dark:bg-emerald-950/30",
      accent: "text-emerald-600 dark:text-emerald-300",
    },
  ];

  const rates = [
    { label: "Delivery rate", value: `${deliveryRate.toFixed(1)}%`, icon: Truck, tone: "text-emerald-600" },
    { label: "Click rate", value: `${clickRate.toFixed(2)}%`, icon: MousePointerClick, tone: "text-indigo-600" },
    { label: "Bounce rate", value: `${bounceRate.toFixed(2)}%`, icon: AlertTriangle, tone: "text-red-500" },
    { label: "Registrations from email", value: conversionCount.toLocaleString(), icon: TrendingUp, tone: "text-violet-600" },
  ];

  const quickActions = [
    {
      href: "/marketing/campaigns/new",
      title: "Create a campaign",
      desc: "Pick an audience, a template, and hit send.",
      icon: Megaphone,
      surface: "bg-gradient-to-br from-indigo-50 to-violet-100 dark:from-indigo-950/40 dark:to-violet-950/30",
      accent: "text-indigo-700 dark:text-indigo-300",
    },
    {
      href: "/marketing/contacts/import",
      title: "Import contacts",
      desc: "Upload a CSV of students or prospects.",
      icon: Upload,
      surface: "bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/30",
      accent: "text-emerald-700 dark:text-emerald-300",
    },
    {
      href: "/marketing/segments/new",
      title: "Build a segment",
      desc: "Slice audiences by college, year, branch.",
      icon: Filter,
      surface: "bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/30",
      accent: "text-amber-700 dark:text-amber-300",
    },
    {
      href: "/marketing/templates/new",
      title: "Design a template",
      desc: "Paste HTML or use the visual editor.",
      icon: Palette,
      surface: "bg-gradient-to-br from-rose-50 to-pink-100 dark:from-rose-950/40 dark:to-pink-950/30",
      accent: "text-rose-700 dark:text-rose-300",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your marketing and transactional email.
          </p>
        </div>
        <Link
          href="/marketing/campaigns/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:shadow-md"
        >
          <Megaphone className="h-4 w-4" />
          New campaign
        </Link>
      </div>

      {/* Big stat tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="group relative overflow-hidden rounded-xl border border-border/60 bg-white p-5 shadow-sm transition hover:shadow-md dark:bg-slate-900/60">
              <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${s.gradient} opacity-10 blur-xl transition group-hover:opacity-20`} />
              <div className="relative">
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${s.surface}`}>
                  <Icon className={`h-5 w-5 ${s.accent}`} />
                </div>
                <div className="mt-4 text-2xl font-semibold tabular-nums">{s.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rates strip */}
      <div className="rounded-xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
        <div className="grid grid-cols-2 divide-x divide-border/60 md:grid-cols-4">
          {rates.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <Icon className={`h-5 w-5 ${r.tone}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold tabular-nums">{r.value}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions + Recent campaigns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent campaigns</h2>
              <p className="text-xs text-muted-foreground">Last 5 campaigns you touched.</p>
            </div>
            <Link href="/marketing/campaigns" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">
              View all →
            </Link>
          </div>
          {recentCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-white p-10 text-center shadow-sm dark:bg-slate-900/40">
              <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 dark:from-indigo-950/40 dark:to-violet-950/30">
                <Megaphone className="h-7 w-7 text-indigo-500 dark:text-indigo-300" />
              </div>
              <div className="text-sm font-medium">No campaigns yet</div>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                When you launch your first campaign, its progress and analytics will appear here.
              </p>
              <Link
                href="/marketing/campaigns/new"
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:shadow-md"
              >
                Create your first campaign
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm dark:bg-slate-900/60">
              <ul className="divide-y divide-border/60">
                {recentCampaigns.map((c) => {
                  const tone = statusTone[c.status];
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/marketing/campaigns/${c.id}`}
                        className="flex items-center gap-4 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {c.totalRecipients.toLocaleString()} recipients · {c.deliveredCount.toLocaleString()} delivered · {c.clickedCount.toLocaleString()} clicks
                          </div>
                        </div>
                        <Badge tone={tone.badge}>{c.status}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">Quick actions</h2>
              <p className="text-xs text-muted-foreground">Jump straight into a task.</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {quickActions.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className={`group flex items-center gap-3 rounded-xl border border-border/60 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${q.surface}`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/70 dark:bg-slate-900/50">
                    <Icon className={`h-5 w-5 ${q.accent}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{q.title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{q.desc}</div>
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 transition group-hover:translate-x-0.5 ${q.accent}`} />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
