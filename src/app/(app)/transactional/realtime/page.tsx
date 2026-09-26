import Link from "next/link";
import { Activity, Send, Truck, MailOpen, MousePointerClick, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { EmailEventType, EmailType } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Real time" };

// Auto-refreshes every 20s so it feels live without SSE/websockets.
const WINDOWS = {
  "30m": { label: "30 min", minutes: 30, bucketMin: 1, unit: "min" },
  "1h": { label: "1 hour", minutes: 60, bucketMin: 2, unit: "2 min" },
  "24h": { label: "24 hours", minutes: 1440, bucketMin: 60, unit: "hour" },
} as const;
type WindowKey = keyof typeof WINDOWS;

function bucketize(times: Date[], since: Date, bucketMin: number, buckets: number): number[] {
  const arr = new Array<number>(buckets).fill(0);
  for (const t of times) {
    const idx = Math.floor((t.getTime() - since.getTime()) / (bucketMin * 60_000));
    if (idx >= 0 && idx < buckets) arr[idx] = (arr[idx] ?? 0) + 1;
  }
  return arr;
}

export default async function RealtimePage({ searchParams }: { searchParams: { window?: string } }) {
  const key: WindowKey = searchParams.window && searchParams.window in WINDOWS ? (searchParams.window as WindowKey) : "30m";
  const win = WINDOWS[key];
  const buckets = win.minutes / win.bucketMin;
  const since = new Date(Date.now() - win.minutes * 60_000);

  const [events, sentJobs] = await Promise.all([
    db.emailEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, createdAt: true },
    }),
    db.emailJob.findMany({
      where: { sentAt: { gte: since } },
      select: { sentAt: true, emailType: true },
    }),
  ]);

  const count = (t: EmailEventType) => events.filter((e) => e.type === t).length;
  const sent = sentJobs.length;
  const sentCampaign = sentJobs.filter((j) => j.emailType === EmailType.MARKETING).length;
  const sentTransactional = sent - sentCampaign;

  const sentSeries = bucketize(sentJobs.map((j) => j.sentAt as Date), since, win.bucketMin, buckets);
  const eventSeries = bucketize(events.map((e) => e.createdAt), since, win.bucketMin, buckets);
  const peak = Math.max(...sentSeries, 0);

  const tiles = [
    { label: "Sent", value: sent, icon: Send, tone: "text-emerald-600", surface: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Delivered", value: count(EmailEventType.DELIVERY), icon: Truck, tone: "text-emerald-600", surface: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Opens", value: count(EmailEventType.OPEN), icon: MailOpen, tone: "text-teal-600", surface: "bg-teal-50 dark:bg-teal-950/30" },
    { label: "Clicks", value: count(EmailEventType.CLICK), icon: MousePointerClick, tone: "text-sky-600", surface: "bg-sky-50 dark:bg-sky-950/30" },
    { label: "Bounced", value: count(EmailEventType.BOUNCE), icon: AlertTriangle, tone: "text-rose-600", surface: "bg-rose-50 dark:bg-rose-950/30" },
  ];

  return (
    <div>
      <meta httpEquiv="refresh" content="20" />

      <PageHeader
        title="Real time"
        icon={Activity}
        description={<>Campaign and transactional email from the last {win.label}. Auto-refreshes every 20 seconds.</>}
        actions={
          <div className="flex gap-1 rounded-full border border-border/60 bg-white p-1 dark:bg-slate-900">
            {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
              <Link
                key={k}
                href={k === "30m" ? "/transactional/realtime" : `/transactional/realtime?window=${k}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  k === key ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {WINDOWS[k].label}
              </Link>
            ))}
          </div>
        }
      />

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-white p-5 shadow-sm dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Sent per {win.unit}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {sentCampaign.toLocaleString()} campaign · {sentTransactional.toLocaleString()} transactional · peak{" "}
                <span className="font-semibold text-foreground">{peak}</span>/{win.unit}
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Send className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Sparkline data={sentSeries} width={520} height={100} stroke="#10b981" fill="#10b981" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{win.label} ago</span>
            <span>{sent} sent total</span>
            <span>now</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-white p-5 shadow-sm dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Events per {win.unit}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Deliveries, opens, clicks, bounces and complaints reported by SES.
              </div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Sparkline data={eventSeries} width={520} height={100} stroke="#10b981" fill="#10b981" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{win.label} ago</span>
            <span>{events.length} events total</span>
            <span>now</span>
          </div>
        </div>
      </div>
    </div>
  );
}
