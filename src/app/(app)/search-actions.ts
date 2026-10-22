"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { contactListWhere, currentScope, fromEmailWhere, templateWhere } from "@/server/access/scope";
import { currentAccess } from "@/server/access/permissions";

export type SearchHit = {
  kind: "campaign" | "personal" | "list" | "template" | "segment" | "contact";
  title: string;
  subtitle?: string;
  href: string;
};

/** Global search for the Ctrl+K palette. A few results per kind, newest first. */
export async function globalSearch(raw: string): Promise<SearchHit[]> {
  await requireUser();
  // Campaigns, batches and templates are limited to this person's brands.
  const scope = await currentScope();
  const scoped = fromEmailWhere(scope);
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  // Only sections this person may open.
  const access = await currentAccess();
  const none = Promise.resolve([] as never[]);
  const contactsOk = access.has("contacts.manage");
  const [campaigns, personal, lists, templates, segments, contacts] = await Promise.all([
    !access.has("campaigns.manage") ? none : db.campaign.findMany({ where: { AND: [scoped, { OR: [{ name: has }, { subject: has }] }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, status: true, subject: true } }),
    !access.has("personal.manage") ? none : db.directSend.findMany({ where: { AND: [scoped, { name: has }] }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true, status: true, totalRows: true } }),
    !contactsOk ? none : db.contactList.findMany({ where: { AND: [contactListWhere(scope), { name: has }] }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true, kind: true, _count: { select: { members: true } } } }),
    !access.has("templates.manage") ? none : db.emailTemplate.findMany({ where: { AND: [templateWhere(scope), { name: has }] }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true, category: true } }),
    !contactsOk ? none : db.segment.findMany({ where: { name: has }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, name: true } }),
    !contactsOk ? none : db.marketingContact.findMany({
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
