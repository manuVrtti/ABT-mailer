import Link from "next/link";
import { CampaignStatus, ContactListKind, EmailType, Prisma, Role } from "@prisma/client";
import {
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  FileText,
  Megaphone,
  Send,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeader,
  StatCard,
  Table,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { ActivityChart } from "@/components/activity-chart";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";
import { conversionTotals } from "@/server/conversions/stats";
import {
  canSeeKlymb,
  contactListWhere,
  currentScope,
  fromEmailSql,
  fromEmailWhere,
  type SenderScope,
} from "@/server/access/scope";
import { currentAccess, currentPermissions } from "@/server/access/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const WINDOW = 30;

const CAMPAIGN_TONE: Record<CampaignStatus, "muted" | "success" | "warning" | "destructive" | "info"> = {
  DRAFT: "muted",
  SCHEDULED: "info",
  QUEUED: "info",
  SENDING: "info",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "warning",
  FAILED: "destructive",
};

type PeriodRow = {
  cur: boolean;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

/**
 * Campaign + personal-mail engagement for the last 30 days and the 30 before.
 * Events are counted against the day the email was sent, so a rate never
 * mixes this period's opens with last period's sends. Automated transactional
 * mail (OTPs, receipts) is left out — it would distort open rates.
 */
async function periodStats(curStart: Date, prevStart: Date, scope: SenderScope) {
  const rows = await db.$queryRaw<PeriodRow[]>(Prisma.sql`
    SELECT (j.sent_at >= ${curStart}) AS cur,
      count(*)::int AS sent,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'DELIVERY'))::int AS delivered,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'OPEN'))::int AS opened,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'CLICK'))::int AS clicked,
      count(*) FILTER (WHERE j.status = 'BOUNCED' OR EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'BOUNCE'))::int AS bounced,
      count(*) FILTER (WHERE j.status = 'COMPLAINED' OR EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'COMPLAINT'))::int AS complained
    FROM email_jobs j
    WHERE (j.campaign_id IS NOT NULL OR j.direct_send_id IS NOT NULL) AND j.sent_at >= ${prevStart}${fromEmailSql(scope, Prisma.sql`j.from_email`)}
    GROUP BY 1`);
  const empty: PeriodRow = {
    cur: true,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
  };
  return {
    cur: rows.find((r) => r.cur) ?? empty,
    prev: rows.find((r) => !r.cur) ?? { ...empty, cur: false },
  };
}

/** Per-day sent / opened / clicked (IST days) for the chart. */
async function dailySeries(start: Date, scope: SenderScope) {
  const rows = await db.$queryRaw<{ d: string; sent: number; opened: number; clicked: number }[]>(Prisma.sql`
    SELECT to_char(j.sent_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
      count(*)::int AS sent,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'OPEN'))::int AS opened,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events e WHERE e.job_id = j.id AND e.type = 'CLICK'))::int AS clicked
    FROM email_jobs j
    WHERE (j.campaign_id IS NOT NULL OR j.direct_send_id IS NOT NULL) AND j.sent_at >= ${start}${fromEmailSql(scope, Prisma.sql`j.from_email`)}
    GROUP BY 1`);
  const byDay = new Map(rows.map((r) => [r.d, r]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const short = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
  const labels: string[] = [];
  const sent: number[] = [];
  const opened: number[] = [];
  const clicked: number[] = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY);
    const r = byDay.get(fmt.format(day));
    labels.push(short.format(day));
    sent.push(r?.sent ?? 0);
    opened.push(r?.opened ?? 0);
    clicked.push(r?.clicked ?? 0);
  }
  return { labels, sent, opened, clicked };
}

async function contactsPerDay(start: Date): Promise<number[]> {
  const rows = await db.marketingContact.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true },
  });
  const buckets = new Array<number>(WINDOW).fill(0);
  for (const r of rows) {
    const i = Math.floor((r.createdAt.getTime() - start.getTime()) / DAY);
    if (i >= 0 && i < WINDOW) buckets[i]!++;
  }
  return buckets;
}

const rate = (n: number, of: number) => (of > 0 ? n / of : 0);
const pct = (n: number, of: number, digits = 1) => (of > 0 ? `${((n / of) * 100).toFixed(digits)}%` : "—");
/** Relative change between two rates/counts, or null when there's nothing to compare. */
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

export default async function DashboardPage() {
  const user = await requireUser();
  const now = Date.now();
  const curStart = new Date(now - WINDOW * DAY);
  const prevStart = new Date(now - 2 * WINDOW * DAY);
  const weekAgo = new Date(now - 7 * DAY);
  // Only email from this person's brands (all, for admins).
  const scope = await currentScope();
  const scoped = fromEmailWhere(scope);

  const [
    period,
    series,
    contacts,
    newContacts,
    newContactsPrev,
    contactSeries,
    lists,
    klymbLists,
    suppressed,
    recentCampaigns,
    recentPersonal,
    txn,
    conv,
  ] = await Promise.all([
    periodStats(curStart, prevStart, scope),
    dailySeries(curStart, scope),
    db.marketingContact.count(),
    db.marketingContact.count({ where: { createdAt: { gte: curStart } } }),
    db.marketingContact.count({ where: { createdAt: { gte: prevStart, lt: curStart } } }),
    contactsPerDay(curStart),
    db.contactList.count({ where: contactListWhere(scope) }),
    db.contactList.count({ where: { AND: [contactListWhere(scope), { kind: ContactListKind.KLYMB }] } }),
    db.suppression.count(),
    db.campaign.findMany({
      where: scoped,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        totalRecipients: true,
        deliveredCount: true,
        openedCount: true,
        clickedCount: true,
        startedAt: true,
        completedAt: true,
        scheduledAt: true,
      },
    }),
    db.directSend.findMany({
      where: scoped,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, name: true, status: true, totalRows: true, createdAt: true, single: true },
    }),
    db.emailJob.groupBy({
      by: ["status"],
      where: {
        AND: [
          scoped,
          { emailType: EmailType.TRANSACTIONAL, directSendId: null, createdAt: { gte: weekAgo } },
        ],
      },
      _count: { _all: true },
    }),
    conversionTotals(WINDOW, scope),
  ]);

  const { cur, prev } = period;
  const txnCount = (s: string[]) =>
    txn.filter((t) => s.includes(t.status)).reduce((n, t) => n + t._count._all, 0);
  const txnTotal = txnCount([
    "PENDING",
    "QUEUED",
    "SENDING",
    "SENT",
    "DELIVERED",
    "BOUNCED",
    "COMPLAINED",
    "FAILED",
    "SKIPPED",
  ]);
  const txnDelivered = txnCount(["DELIVERED"]);
  const txnBounced = txnCount(["BOUNCED"]);
  const txnFailed = txnCount(["FAILED"]);

  const bounceRate = rate(cur.bounced, cur.sent);
  const complaintRate = rate(cur.complained, cur.sent);
  const health = [
    {
      label: "Bounce rate",
      value: pct(cur.bounced, cur.sent, 2),
      state: bounceRate < 0.02 ? "good" : bounceRate < 0.05 ? "warn" : "bad",
      hint: "Keep under 2%",
    },
    {
      label: "Spam complaints",
      value: pct(cur.complained, cur.sent, 2),
      state: complaintRate < 0.001 ? "good" : complaintRate < 0.003 ? "warn" : "bad",
      hint: "Keep under 0.1%",
    },
    {
      label: "Suppressed addresses",
      value: suppressed.toLocaleString(),
      state: "info",
      hint: "Never emailed again",
    },
  ] as const;

  const firstName = (user.name ?? user.email ?? "there").split(/\s+|@/)[0] ?? "there";
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(
      new Date(),
    ),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  // Each card shows only when its section is ticked for this person's role.
  const [perms, access] = await Promise.all([currentPermissions(), currentAccess()]);
  const canCreate = perms.has("campaigns.manage");
  const canPersonal = perms.has("personal.manage");
  const klymb = canSeeKlymb(scope);
  const show = {
    analytics: access.has("analytics.view"),
    campaigns: access.has("campaigns.manage"),
    contacts: access.has("contacts.manage"),
    logs: access.has("logs.view"),
    personal: access.has("personal.manage"),
  };
  const quickActions = [
    klymb &&
      perms.has("contacts.manage") && {
        href: "/marketing/contacts/lists/klymb/new",
        label: "New Klymb list",
        icon: DatabaseZap,
      },
    perms.has("contacts.manage") && {
      href: "/marketing/contacts/import",
      label: "Import contacts",
      icon: Upload,
    },
    perms.has("templates.manage") && {
      href: "/marketing/templates/new",
      label: "New template",
      icon: FileText,
    },
    perms.has("contacts.manage") && { href: "/marketing/segments/new", label: "New segment", icon: Users },
  ].filter((a): a is { href: string; label: string; icon: typeof Upload } => Boolean(a));
  const hasMain = show.analytics || show.campaigns;
  const hasSide = show.analytics || show.contacts || show.logs || show.personal || quickActions.length > 0;
  const shortDate = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-8 tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {show.analytics
              ? "Here\u2019s how your email performed over the last 30 days."
              : "Here\u2019s what\u2019s happening."}
          </p>
        </div>
        {(canCreate || canPersonal) && (
          <div className="flex gap-2">
            {canPersonal && (
              <Button as="a" href="/marketing/customize" variant={canCreate ? "secondary" : "primary"}>
                <Send className="h-4 w-4" /> Customize mail
              </Button>
            )}
            {canCreate && (
              <Button as="a" href="/marketing/campaigns/new">
                <Megaphone className="h-4 w-4" /> New campaign
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasMain && !hasSide && (
        <EmptyState
          icon={Megaphone}
          title="Nothing to show yet"
          description="Your role doesn't include any dashboard sections. Ask an admin if you need access to more."
        />
      )}

      {/* KPIs */}
      {show.analytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Emails sent"
            value={cur.sent.toLocaleString()}
            delta={change(cur.sent, prev.sent)}
            sub="Campaigns + customized mails"
          />
          <StatCard
            label="Delivery rate"
            value={pct(cur.delivered, cur.sent)}
            delta={change(rate(cur.delivered, cur.sent), rate(prev.delivered, prev.sent))}
            sub={`${cur.delivered.toLocaleString()} delivered`}
          />
          <StatCard
            label="Open rate"
            value={pct(cur.opened, cur.delivered)}
            delta={change(rate(cur.opened, cur.delivered), rate(prev.opened, prev.delivered))}
            sub={`${cur.opened.toLocaleString()} opened`}
          />
          <StatCard
            label="Click rate"
            value={pct(cur.clicked, cur.delivered, 2)}
            delta={change(rate(cur.clicked, cur.delivered), rate(prev.clicked, prev.delivered))}
            sub={`${cur.clicked.toLocaleString()} clicked`}
          />
          <StatCard
            label="Bounce rate"
            value={pct(cur.bounced, cur.sent, 2)}
            delta={change(rate(cur.bounced, cur.sent), rate(prev.bounced, prev.sent))}
            invert
            sub={`${cur.bounced.toLocaleString()} bounced`}
          />
          <StatCard
            label="Conversions"
            value={conv.cur.toLocaleString()}
            delta={change(conv.cur, conv.prev)}
            sub="Klymb actions after an email"
            href="/marketing/analytics/conversions"
          />
        </div>
      )}

      {/* Main column + side cards */}
      <div className={cn("grid gap-4", hasMain ? "xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3")}>
        {hasMain && (
          <div className="space-y-4 xl:col-span-2">
            {show.analytics && (
              <Card>
                <SectionHeader
                  title="Email activity"
                  description="Emails sent per day, with opens and clicks · last 30 days (IST)"
                  actions={
                    <Link
                      href="/marketing/analytics"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      Analytics <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                {cur.sent === 0 ? (
                  <div className="grid h-56 place-items-center text-sm text-muted-foreground">
                    No campaign or personal mail sent in the last 30 days.
                  </div>
                ) : (
                  <ActivityChart
                    labels={series.labels}
                    sent={series.sent}
                    opened={series.opened}
                    clicked={series.clicked}
                    height={330}
                  />
                )}
              </Card>
            )}

            {show.campaigns && (
              <div>
                <SectionHeader
                  title="Recent campaigns"
                  actions={
                    <Link
                      href="/marketing/campaigns"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      All campaigns <ArrowRight className="h-3 w-3" />
                    </Link>
                  }
                />
                {recentCampaigns.length === 0 ? (
                  <EmptyState
                    icon={Megaphone}
                    title="No campaigns yet"
                    description="Your campaigns and their results will show up here."
                    action={
                      canCreate ? (
                        <Button as="a" href="/marketing/campaigns/new">
                          New campaign
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <TH>Campaign</TH>
                        <TH>Status</TH>
                        <TH className="text-right">Recipients</TH>
                        <TH className="text-right">Opens</TH>
                        <TH className="text-right">Clicks</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {recentCampaigns.map((c) => {
                        const when = c.completedAt ?? c.startedAt ?? c.scheduledAt;
                        return (
                          <TR key={c.id}>
                            <TD className="max-w-[280px]">
                              <Link
                                href={`/marketing/campaigns/${c.id}`}
                                className="block truncate font-medium hover:underline"
                              >
                                {c.name}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {when ? shortDate.format(when) : "Not sent"}
                              </div>
                            </TD>
                            <TD>
                              <Badge tone={CAMPAIGN_TONE[c.status]} dot>
                                {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                              </Badge>
                            </TD>
                            <TD className="tabular text-right">{c.totalRecipients.toLocaleString()}</TD>
                            <TD className="tabular text-right">{pct(c.openedCount, c.deliveredCount)}</TD>
                            <TD className="tabular text-right">{pct(c.clickedCount, c.deliveredCount, 2)}</TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            )}
          </div>
        )}

        <div className={cn(hasMain ? "space-y-4" : "contents")}>
          {show.analytics && (
            <Card>
              <SectionHeader title="Sending health" description="Last 30 days" />
              <ul className="space-y-3">
                {health.map((h) => (
                  <li key={h.label} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {h.state === "good" ? (
                        <CheckCircle2 className="h-4 w-4 text-brand-600" />
                      ) : h.state === "info" ? (
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ShieldAlert
                          className={cn("h-4 w-4", h.state === "warn" ? "text-amber-500" : "text-red-600")}
                        />
                      )}
                      <div>
                        <div className="text-sm">{h.label}</div>
                        <div className="text-2xs text-muted-foreground">{h.hint}</div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "tabular text-sm font-semibold",
                        h.state === "warn" && "text-amber-600",
                        h.state === "bad" && "text-red-600",
                      )}
                    >
                      {h.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {show.contacts && (
            <Card>
              <SectionHeader
                title="Audience"
                actions={
                  <Link
                    href="/marketing/contacts"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    Contacts <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="tabular text-2xl font-semibold tracking-tight">
                    {contacts.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    contacts · <span className="text-foreground">+{newContacts.toLocaleString()}</span> in 30
                    days
                    {newContactsPrev > 0 && (
                      <span
                        className={cn(
                          "ml-1",
                          newContacts >= newContactsPrev
                            ? "text-brand-700 dark:text-brand-300"
                            : "text-red-600",
                        )}
                      >
                        ({newContacts >= newContactsPrev ? "▲" : "▼"}{" "}
                        {Math.abs(Math.round(((newContacts - newContactsPrev) / newContactsPrev) * 100))}%)
                      </span>
                    )}
                  </div>
                </div>
                <Sparkline data={contactSeries} width={120} height={36} />
              </div>
              <div className={cn("mt-4 grid gap-2 text-xs", klymb ? "grid-cols-2" : "grid-cols-1")}>
                <Link
                  href="/marketing/contacts/lists"
                  className="rounded-md border border-border px-3 py-2 hover:bg-muted"
                >
                  <div className="tabular text-base font-semibold">{lists}</div>
                  <div className="text-muted-foreground">Lists</div>
                </Link>
                {klymb && (
                  <Link
                    href="/marketing/contacts/lists"
                    className="rounded-md border border-border px-3 py-2 hover:bg-muted"
                  >
                    <div className="tabular flex items-center gap-1 text-base font-semibold">
                      {klymbLists} <DatabaseZap className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                    <div className="text-muted-foreground">Live Klymb lists</div>
                  </Link>
                )}
              </div>
            </Card>
          )}
          {show.logs && (
            <Card>
              <SectionHeader
                title="Transactional"
                description="Automated emails · last 7 days"
                actions={
                  <Link
                    href="/transactional/logs"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    Logs <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              <div className="tabular text-2xl font-semibold tracking-tight">{txnTotal.toLocaleString()}</div>
              <div className="mb-3 text-xs text-muted-foreground">emails triggered</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <MiniStat label="Delivered" value={pct(txnDelivered, txnTotal)} />
                <MiniStat
                  label="Bounced"
                  value={pct(txnBounced, txnTotal)}
                  tone={txnBounced ? "bad" : undefined}
                />
                <MiniStat
                  label="Failed"
                  value={pct(txnFailed, txnTotal)}
                  tone={txnFailed ? "bad" : undefined}
                />
              </div>
            </Card>
          )}

          {show.personal && (
            <Card>
              <SectionHeader
                title="Customize mail"
                actions={
                  <Link
                    href="/marketing/customize"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    All <ArrowRight className="h-3 w-3" />
                  </Link>
                }
              />
              {recentPersonal.length === 0 ? (
                <p className="text-sm text-muted-foreground">No batches yet.</p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {recentPersonal.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/marketing/customize/${p.id}`}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="text-2xs text-muted-foreground">
                            {p.single ? "Single email" : `${p.totalRows} emails`} · {shortDate.format(p.createdAt)}
                          </span>
                        </span>
                        <Badge
                          tone={
                            p.status === "COMPLETED"
                              ? "success"
                              : p.status === "SENDING"
                                ? "info"
                                : p.status === "CANCELLED"
                                  ? "warning"
                                  : "muted"
                          }
                          dot
                        >
                          {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {quickActions.length > 0 && (
            <Card>
              <SectionHeader title="Quick actions" />
              <div className="-mx-2 space-y-0.5">
                {quickActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <a.icon className="h-4 w-4 text-muted-foreground group-hover:text-brand-600" />
                    <span className="flex-1">{a.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-2">
      <div className={cn("tabular text-sm font-semibold", tone === "bad" && "text-red-600")}>{value}</div>
      <div className="text-2xs text-muted-foreground">{label}</div>
    </div>
  );
}
