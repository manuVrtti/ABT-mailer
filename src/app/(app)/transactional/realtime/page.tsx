import { Activity, Send, Truck, MailOpen, MousePointerClick, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { EmailEventType, EmailType } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Real time" };

// This page auto-refreshes every 20s so it feels genuinely "real time" without
// needing SSE/websockets. Small footprint on Vercel — 3 counts per refresh.
const WINDOW_MIN = 30;

function bucketByMinute(times: Date[], since: Date): number[] {
  const arr = new Array<number>(WINDOW_MIN).fill(0);
  for (const t of times) {
    const idx = Math.floor((t.getTime() - since.getTime()) / 60_000);
    if (idx >= 0 && idx < WINDOW_MIN) arr[idx] = (arr[idx] ?? 0) + 1;
  }
  return arr;
}

export default async function TransactionalRealtimePage() {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);

  const [events, jobs] = await Promise.all([
    db.emailEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    db.emailJob.findMany({
      where: { emailType: EmailType.TRANSACTIONAL, createdAt: { gte: since } },
      select: { createdAt: true, sentAt: true, status: true },
    }),
  ]);

  const eventsTotal = events.length;
  const delivered = events.filter((e) => e.type === EmailEventType.DELIVERY).length;
  const opened = events.filter((e) => e.type === EmailEventType.OPEN).length;
  const clicked = events.filter((e) => e.type === EmailEventType.CLICK).length;
  const bounced = events.filter((e) => e.type === EmailEventType.BOUNCE).length;
  const sent = jobs.filter((j) => j.sentAt).length;

  const perMinute = bucketByMinute(
    jobs.filter((j) => j.sentAt).map((j) => j.sentAt as Date),
    since,
  );
  const eventsPerMinute = bucketByMinute(
    events.map((e) => e.createdAt),
    since,
  );
  const peakPerMinute = Math.max(...perMinute, 0);

  const tiles = [
    { label: "Events", value: eventsTotal, icon: Activity, tone: "text-indigo-600", surface: "bg-indigo-50 dark:bg-indigo-950/30" },
    { label: "Delivered", value: delivered, icon: Truck, tone: "text-emerald-600", surface: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Opens", value: opened, icon: MailOpen, tone: "text-violet-600", surface: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Clicks", value: clicked, icon: MousePointerClick, tone: "text-sky-600", surface: "bg-sky-50 dark:bg-sky-950/30" },
    { label: "Bounced", value: bounced, icon: AlertTriangle, tone: "text-rose-600", surface: "bg-rose-50 dark:bg-rose-950/30" },
  ];

  return (
    <div>
      {/* Auto refresh every 20s */}
      <meta httpEquiv="refresh" content="20" />

      <PageHeader
        title="Real time"
        icon={Activity}
        description={<>Data from the last {WINDOW_MIN} minutes. Auto-refreshes every 20 seconds.</>}
      />

      {/* Big tiles */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.label} className="rounded-xl border border-border/60 bg-white p-4 shadow-sm dark:bg-slate-900/60">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${t.surface}`}>
                <Icon className={`h-5 w-5 ${t.tone}`} />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">{t.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{t.label}</div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-white p-5 shadow-sm dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Sent per minute</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Peak in this window: <span className="font-semibold text-foreground">{peakPerMinute}/min</span>
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Send className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Sparkline data={perMinute} width={520} height={100} stroke="#10b981" fill="#10b981" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{WINDOW_MIN} min ago</span>
            <span>{sent} sent total</span>
            <span>now</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-white p-5 shadow-sm dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Events per minute</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Delivery, opens, clicks, bounces, complaints combined.
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Sparkline data={eventsPerMinute} width={520} height={100} stroke="#6366f1" fill="#6366f1" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{WINDOW_MIN} min ago</span>
            <span>{eventsTotal} events total</span>
            <span>now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
