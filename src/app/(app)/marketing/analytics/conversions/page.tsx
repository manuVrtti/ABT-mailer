import Link from "next/link";
import { Role } from "@prisma/client";
import { Target, Info } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Badge, Card, EmptyState, PageHeader, SectionHeader, StatCard, Table, TD, TH, THead, TR } from "@/components/ui";
import { ActivityChart } from "@/components/activity-chart";
import { cn } from "@/lib/utils";
import { conversionOverview } from "@/server/conversions/stats";
import { ensureConversionsFresh, lastConversionRun } from "@/server/conversions/refresh";
import { ATTRIBUTION_WINDOW_DAYS, KIND_LABELS, describeGoal } from "@/server/conversions/kinds";
import { AnalyticsTabs } from "../_tabs";
import { currentScope } from "@/server/access/scope";
import { RefreshConversionsButton } from "./_controls";

export const dynamic = "force-dynamic";
// A stale cache is rebuilt on first view (reads Klymb, ~10 s).
export const maxDuration = 120;
export const metadata = { title: "Conversions" };

const PERIODS = [7, 30, 90] as const;

function ago(d: Date): string {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}
const rate = (n: number, of: number) => (of > 0 ? n / of : 0);
const pct = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(n / of < 0.01 && n > 0 ? 2 : 1)}%` : "—");
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

export default async function ConversionsPage({ searchParams }: { searchParams: { days?: string } }) {
  const user = await requireUser();
  const days = (PERIODS as readonly number[]).includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  // Rebuild when older than 6 hours (or never built); the hourly QStash job usually keeps it fresh.
  await ensureConversionsFresh(360);
  const [o, run] = await Promise.all([conversionOverview(days, await currentScope()), lastConversionRun()]);
  const canEdit = user.role !== Role.VIEWER;
  const maxKind = o.byKind[0]?.n ?? 1;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Did your emails make people act? Klymb signups, registrations, enrollments and applications after each email."
        actions={canEdit ? <RefreshConversionsButton /> : undefined}
      />
      <AnalyticsTabs active="conversions" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-xs">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/marketing/analytics/conversions${p === 30 ? "" : `?days=${p}`}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                p === days ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Last {p} days
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          An action counts if it happens within {ATTRIBUTION_WINDOW_DAYS} days of an email; the last email before it gets the credit.
          {run?.finishedAt && <span>· Updated {ago(run.finishedAt)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Conversions" value={o.conversions.toLocaleString()} delta={change(o.conversions, o.prevConversions)} sub={`Actions in the last ${days} days`} />
        <StatCard label="People who acted" value={o.people.toLocaleString()} sub={`of ${o.emailed.toLocaleString()} people emailed`} />
        <StatCard
          label="Conversion rate"
          value={pct(o.people, o.emailed)}
          delta={change(rate(o.people, o.emailed), rate(o.prevPeople, o.prevEmailed))}
          sub="People who acted ÷ people emailed"
        />
        <StatCard label="After clicking" value={pct(o.clicked, o.conversions)} sub={`${o.clicked.toLocaleString()} acted after clicking the email`} />
      </div>

      {run === null ? (
        <div className="mt-6">
          <EmptyState icon={Target} title="Conversions haven't been calculated yet" description="Click Refresh to match your emails against Klymb activity. It takes about 10 seconds." />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <SectionHeader title="Conversions per day" description="By the day people acted (IST)" />
              <ActivityChart
                labels={o.byDay.labels}
                sent={o.byDay.conversions}
                opened={o.byDay.clicked}
                clicked={[]}
                legend={["Conversions", "After a click", ""]}
                height={260}
              />
            </Card>
            <Card>
              <SectionHeader title="What people did" />
              {o.byKind.length === 0 ? (
                <p className="text-sm text-muted-foreground">No actions in this period.</p>
              ) : (
                <ul className="space-y-3">
                  {o.byKind.map((k) => (
                    <li key={k.kind} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{KIND_LABELS[k.kind] ?? k.kind}</span>
                        <span className="tabular text-muted-foreground">{k.n.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(k.n / maxKind) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-6">
            <SectionHeader title="By campaign" description="Campaigns and personal-mail batches credited with at least one conversion in this period" />
            {o.sources.length === 0 ? (
              <EmptyState icon={Target} title="No conversions in this period" description="When recipients sign up, register or enroll within a week of an email, it shows up here." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Campaign</TH>
                    <TH className="text-right">Recipients</TH>
                    <TH className="text-right">Conversions</TH>
                    <TH className="text-right">People</TH>
                    <TH className="text-right">Rate</TH>
                    <TH className="text-right">After a click</TH>
                    <TH>Goal</TH>
                  </tr>
                </THead>
                <tbody>
                  {o.sources.map((s) => (
                    <TR key={`${s.kind}:${s.id}`}>
                      <TD className="max-w-[280px]">
                        <Link
                          href={s.kind === "campaign" ? `/marketing/campaigns/${s.id}` : `/marketing/personal/${s.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="text-2xs text-muted-foreground">{s.kind === "campaign" ? "Campaign" : "Personal mails"}</span>
                      </TD>
                      <TD className="text-right tabular">{s.recipients.toLocaleString()}</TD>
                      <TD className="text-right tabular font-medium">{s.conversions.toLocaleString()}</TD>
                      <TD className="text-right tabular">{s.people.toLocaleString()}</TD>
                      <TD className="text-right tabular">{pct(s.people, s.recipients)}</TD>
                      <TD className="text-right tabular">{pct(s.clicked, s.conversions)}</TD>
                      <TD className="max-w-[220px]">
                        {s.goal ? (
                          <span className="flex items-center gap-1.5">
                            <Badge tone={s.goalCount ? "success" : "muted"}>{s.goalCount ?? 0}</Badge>
                            <span className="truncate text-xs text-muted-foreground">{describeGoal(s.goal)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Any action</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
