import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { goalMatches, type ConversionGoal, type ConversionKind } from "./kinds";
import { fromEmailSql, fromEmailWhere, type SenderScope } from "@/server/access/filters";

/**
 * Read side of conversions. Everything here reads attributed_conversions
 * (rebuilt by refresh.ts) and the mailer's own email tables — never Klymb.
 *
 * "Converted people" counts distinct addresses; "conversions" counts actions
 * (one person registering for two events is 2 conversions, 1 person).
 */

export interface KindCount {
  kind: ConversionKind;
  n: number;
}

export interface CampaignConversions {
  conversions: number;
  people: number;
  clicked: number;
  goal: number | null;
  byKind: KindCount[];
  byLabel: { label: string; n: number }[];
  recent: { email: string; label: string; actionAt: Date; sentAt: Date; clicked: boolean; kind: string; ref: string | null }[];
}

type Source = { campaignId: string } | { directSendId: string };

export async function sourceConversions(source: Source, goal: ConversionGoal | null): Promise<CampaignConversions> {
  const rows = await db.attributedConversion.findMany({
    where: source,
    orderBy: { actionAt: "desc" },
    select: { email: true, label: true, actionAt: true, sentAt: true, clicked: true, kind: true, ref: true },
  });
  const byKind = new Map<string, number>();
  const byLabel = new Map<string, number>();
  for (const r of rows) {
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + 1);
  }
  return {
    conversions: rows.length,
    people: new Set(rows.map((r) => r.email)).size,
    clicked: rows.filter((r) => r.clicked).length,
    goal: goal ? rows.filter((r) => goalMatches(goal, r)).length : null,
    byKind: [...byKind.entries()].map(([kind, n]) => ({ kind: kind as ConversionKind, n })).sort((a, b) => b.n - a.n),
    byLabel: [...byLabel.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    recent: rows,
  };
}

export interface ConversionOverview {
  conversions: number;
  prevConversions: number;
  people: number;
  clicked: number;
  /** People emailed (campaigns + personal mails) in the period. */
  emailed: number;
  prevEmailed: number;
  prevPeople: number;
  byDay: { labels: string[]; conversions: number[]; clicked: number[] };
  byKind: KindCount[];
  sources: {
    kind: "campaign" | "personal";
    id: string;
    name: string;
    recipients: number;
    conversions: number;
    people: number;
    clicked: number;
    goal: ConversionGoal | null;
    goalCount: number | null;
  }[];
}

const DAY = 86_400_000;

export async function conversionOverview(days: number, scope: SenderScope): Promise<ConversionOverview> {
  const scoped = fromEmailWhere(scope);
  const now = Date.now();
  const cur = new Date(now - days * DAY);
  const prev = new Date(now - 2 * days * DAY);

  const [rows, prevRows, emailed, prevEmailed] = await Promise.all([
    db.attributedConversion.findMany({
      where: { AND: [scoped, { actionAt: { gte: cur } }] },
      select: { campaignId: true, directSendId: true, email: true, kind: true, ref: true, clicked: true, actionAt: true },
    }),
    db.attributedConversion.findMany({ where: { AND: [scoped, { actionAt: { gte: prev, lt: cur } }] }, select: { email: true } }),
    distinctRecipients(cur, new Date(now), scope),
    distinctRecipients(prev, cur, scope),
  ]);

  // Per day, IST.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
  const short = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const dayKeys: string[] = [];
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    dayKeys.push(fmt.format(d));
    labels.push(short.format(d));
  }
  const conversions = new Array<number>(days).fill(0);
  const clicked = new Array<number>(days).fill(0);
  for (const r of rows) {
    const i = dayKeys.indexOf(fmt.format(r.actionAt));
    if (i < 0) continue;
    conversions[i]!++;
    if (r.clicked) clicked[i]!++;
  }

  const byKind = new Map<string, number>();
  for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);

  // Per source (campaign / personal batch).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.campaignId ? `c:${r.campaignId}` : `p:${r.directSendId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const campaignIds = [...groups.keys()].filter((k) => k.startsWith("c:")).map((k) => k.slice(2));
  const personalIds = [...groups.keys()].filter((k) => k.startsWith("p:")).map((k) => k.slice(2));
  const [campaigns, personal] = await Promise.all([
    db.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true, totalRecipients: true, conversionGoal: true },
    }),
    db.directSend.findMany({ where: { id: { in: personalIds } }, select: { id: true, name: true, totalRows: true } }),
  ]);
  const sources: ConversionOverview["sources"] = [
    ...campaigns.map((c) => {
      const list = groups.get(`c:${c.id}`) ?? [];
      const goal = (c.conversionGoal ?? null) as ConversionGoal | null;
      return {
        kind: "campaign" as const,
        id: c.id,
        name: c.name,
        recipients: c.totalRecipients,
        conversions: list.length,
        people: new Set(list.map((r) => r.email)).size,
        clicked: list.filter((r) => r.clicked).length,
        goal,
        goalCount: goal ? list.filter((r) => goalMatches(goal, r)).length : null,
      };
    }),
    ...personal.map((p) => {
      const list = groups.get(`p:${p.id}`) ?? [];
      return {
        kind: "personal" as const,
        id: p.id,
        name: p.name,
        recipients: p.totalRows,
        conversions: list.length,
        people: new Set(list.map((r) => r.email)).size,
        clicked: list.filter((r) => r.clicked).length,
        goal: null,
        goalCount: null,
      };
    }),
  ].sort((a, b) => b.conversions - a.conversions);

  return {
    conversions: rows.length,
    prevConversions: prevRows.length,
    people: new Set(rows.map((r) => r.email)).size,
    prevPeople: new Set(prevRows.map((r) => r.email)).size,
    clicked: rows.filter((r) => r.clicked).length,
    emailed,
    prevEmailed,
    byDay: { labels, conversions, clicked },
    byKind: [...byKind.entries()].map(([kind, n]) => ({ kind: kind as ConversionKind, n })).sort((a, b) => b.n - a.n),
    sources,
  };
}

async function distinctRecipients(from: Date, to: Date, scope: SenderScope): Promise<number> {
  const [r] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT count(DISTINCT lower(recipient_email))::int AS n FROM email_jobs
    WHERE (campaign_id IS NOT NULL OR direct_send_id IS NOT NULL) AND sent_at >= ${from} AND sent_at < ${to}${fromEmailSql(scope, Prisma.sql`from_email`)}`);
  return r?.n ?? 0;
}

/** Conversions in the last `days` and the `days` before, for the dashboard tile. */
export async function conversionTotals(days: number, scope: SenderScope): Promise<{ cur: number; prev: number }> {
  const now = Date.now();
  const scoped = fromEmailWhere(scope);
  const [cur, prev] = await Promise.all([
    db.attributedConversion.count({ where: { AND: [scoped, { actionAt: { gte: new Date(now - days * DAY) } }] } }),
    db.attributedConversion.count({
      where: { AND: [scoped, { actionAt: { gte: new Date(now - 2 * days * DAY), lt: new Date(now - days * DAY) } }] },
    }),
  ]);
  return { cur, prev };
}
