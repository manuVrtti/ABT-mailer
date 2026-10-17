"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export type SearchHit = {
  kind: "campaign" | "personal" | "list" | "template" | "segment" | "contact";
  title: string;
  subtitle?: string;
  href: string;
};

/** Global search for the Ctrl+K palette. A few results per kind, newest first. */
export async function globalSearch(raw: string): Promise<SearchHit[]> {
  await requireUser();
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const [campaigns, personal, lists, templates, segments, contacts] = await Promise.all([
    db.campaign.findMany({ where: { OR: [{ name: has }, { subject: has }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, status: true, subject: true } }),
    db.directSend.findMany({ where: { name: has }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true, status: true, totalRows: true } }),
    db.contactList.findMany({ where: { name: has }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true, kind: true, _count: { select: { members: true } } } }),
    db.emailTemplate.findMany({ where: { name: has }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true, category: true } }),
    db.segment.findMany({ where: { name: has }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, name: true } }),
    db.marketingContact.findMany({
      where: { OR: [{ email: has }, { firstName: has }, { lastName: has }] },
      take: 5,
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  ]);
  return [
    ...campaigns.map((c) => ({
      kind: "campaign" as const,
      title: c.name,
      subtitle: `${c.status.toLowerCase()}${c.subject ? ` · ${c.subject}` : ""}`,
      href: `/marketing/campaigns/${c.id}`,
    })),
    ...personal.map((p) => ({
      kind: "personal" as const,
      title: p.name,
      subtitle: `${p.status.toLowerCase()} · ${p.totalRows} emails`,
      href: `/marketing/personal/${p.id}`,
    })),
    ...lists.map((l) => ({
      kind: "list" as const,
      title: l.name,
      subtitle: `${l.kind === "KLYMB" ? "Live Klymb list" : "List"} · ${l._count.members.toLocaleString()} contacts`,
      href: `/marketing/contacts/lists/${l.id}`,
    })),
    ...templates.map((t) => ({ kind: "template" as const, title: t.name, subtitle: t.category, href: `/marketing/templates/${t.id}` })),
    ...segments.map((s) => ({ kind: "segment" as const, title: s.name, href: `/marketing/segments/${s.id}` })),
    ...contacts.map((c) => ({
      kind: "contact" as const,
      title: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
      subtitle: c.email,
      href: `/marketing/contacts?q=${encodeURIComponent(c.email)}`,
    })),
  ];
}
