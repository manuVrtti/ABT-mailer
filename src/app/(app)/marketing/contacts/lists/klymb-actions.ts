"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContactListKind, ListOverrideMode, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/utils";
import { describeKlymbFilter, klymbFilterSchema } from "@/server/klymb/filter";
import { previewKlymbFilter, type KlymbPreview } from "@/server/klymb/people";
import { refreshKlymbList, type KlymbSyncStats } from "@/server/klymb/sync";
import { SUGGEST_FIELDS, suggestKlymbValues, type Suggestion, type SuggestField } from "@/server/klymb/suggest";
import { CONTACT_LIST_COLORS } from "./_constants";

const listMetaSchema = z.object({
  name: z.string().min(1, "Give the list a name").max(120),
  description: z.string().max(500).optional(),
  color: z.enum(CONTACT_LIST_COLORS),
});

function readMeta(formData: FormData) {
  return listMetaSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    color: String(formData.get("color") ?? "emerald"),
  });
}

function readFilter(raw: unknown) {
  try {
    return klymbFilterSchema.safeParse(JSON.parse(String(raw ?? "")));
  } catch {
    return klymbFilterSchema.safeParse(undefined);
  }
}

function firstIssue(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? i.message : "Invalid filter";
}

function revalidateList(id?: string) {
  revalidatePath("/marketing/contacts/lists");
  if (id) revalidatePath(`/marketing/contacts/lists/${id}`);
}

export type PreviewResult = { ok: true; preview: KlymbPreview } | { ok: false; error: string };

/** Live count + breakdown for the filter builder. Reads Klymb; writes nothing. */
export async function previewKlymbListFilter(filterJson: string): Promise<PreviewResult> {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  const parsed = readFilter(filterJson);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    return { ok: true, preview: await previewKlymbFilter(parsed.data) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Type-ahead values for one filter field. Reads Klymb; writes nothing. */
export async function suggestKlymbFilterValues(field: string, q: string): Promise<Suggestion[]> {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  if (!(SUGGEST_FIELDS as readonly string[]).includes(field)) return [];
  try {
    return await suggestKlymbValues(field as SuggestField, q);
  } catch {
    return [];
  }
}

export type SaveResult = { ok: false; error: string };

export async function createKlymbList(formData: FormData): Promise<SaveResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const meta = readMeta(formData);
  if (!meta.success) return { ok: false, error: firstIssue(meta.error) };
  const filter = readFilter(formData.get("filter"));
  if (!filter.success) return { ok: false, error: firstIssue(filter.error) };

  const taken = await db.contactList.findUnique({ where: { name: meta.data.name }, select: { id: true } });
  if (taken) return { ok: false, error: `A list called "${meta.data.name}" already exists.` };

  const list = await db.contactList.create({
    data: {
      ...meta.data,
      kind: ContactListKind.KLYMB,
      klymbFilter: filter.data as unknown as Prisma.InputJsonValue,
    },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "list.create",
      resource: `list:${list.id}`,
      metadata: { name: list.name, kind: "KLYMB", filter: describeKlymbFilter(filter.data) },
      result: "success",
    },
  });
  // A failed first refresh is shown on the list page (syncError) with a retry button.
  await refreshKlymbList(list.id, { trigger: "create", userId: user.id }).catch(() => {});
  revalidateList(list.id);
  redirect(`/marketing/contacts/lists/${list.id}`);
}

export async function updateKlymbList(formData: FormData): Promise<SaveResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const meta = readMeta(formData);
  if (!meta.success) return { ok: false, error: firstIssue(meta.error) };
  const filter = readFilter(formData.get("filter"));
  if (!filter.success) return { ok: false, error: firstIssue(filter.error) };

  const list = await db.contactList.findUnique({ where: { id }, select: { kind: true } });
  if (!list) return { ok: false, error: "List not found." };
  if (list.kind !== ContactListKind.KLYMB) return { ok: false, error: "Only Klymb lists have a filter." };
  const taken = await db.contactList.findFirst({ where: { name: meta.data.name, NOT: { id } }, select: { id: true } });
  if (taken) return { ok: false, error: `A list called "${meta.data.name}" already exists.` };

  await db.contactList.update({
    where: { id },
    data: { ...meta.data, klymbFilter: filter.data as unknown as Prisma.InputJsonValue },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "list.klymb_filter_update",
      resource: `list:${id}`,
      metadata: { filter: describeKlymbFilter(filter.data) },
      result: "success",
    },
  });
  await refreshKlymbList(id, { trigger: "filter_update", userId: user.id }).catch(() => {});
  revalidateList(id);
  redirect(`/marketing/contacts/lists/${id}`);
}

export type RefreshResult = { ok: true; stats: KlymbSyncStats } | { ok: false; error: string };

export async function refreshKlymbListNow(listId: string): Promise<RefreshResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  try {
    const stats = await refreshKlymbList(listId, { trigger: "manual", userId: user.id });
    revalidateList(listId);
    return { ok: true, stats };
  } catch (err) {
    revalidateList(listId);
    return { ok: false, error: (err as Error).message };
  }
}

export type OverrideResult =
  | { ok: true; saved: number; invalid: string[]; refreshError?: string }
  | { ok: false; error: string };

/**
 * Always include / always exclude addresses on a Klymb list. Saving an address
 * replaces any earlier override for it, then the list is refreshed.
 */
export async function addKlymbListOverrides(
  listId: string,
  rawEmails: string,
  mode: ListOverrideMode,
): Promise<OverrideResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const list = await db.contactList.findUnique({ where: { id: listId }, select: { kind: true } });
  if (!list || list.kind !== ContactListKind.KLYMB) return { ok: false, error: "Not a Klymb list." };

  const all = Array.from(new Set(rawEmails.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean)));
  const valid = all.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const invalid = all.filter((e) => !valid.includes(e));
  if (valid.length === 0) return { ok: false, error: "Enter at least one valid email address." };
  if (valid.length > 5000) return { ok: false, error: "At most 5,000 addresses at a time." };

  await db.$transaction([
    db.contactListOverride.deleteMany({ where: { listId, email: { in: valid } } }),
    db.contactListOverride.createMany({ data: valid.map((email) => ({ listId, email, mode })) }),
  ]);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: mode === ListOverrideMode.INCLUDE ? "list.klymb_include" : "list.klymb_exclude",
      resource: `list:${listId}`,
      metadata: { count: valid.length },
      result: "success",
    },
  });
  let refreshError: string | undefined;
  await refreshKlymbList(listId, { trigger: "override", userId: user.id }).catch((err: Error) => {
    refreshError = err.message;
  });
  revalidateList(listId);
  return { ok: true, saved: valid.length, invalid, refreshError };
}

export async function removeKlymbListOverride(listId: string, email: string): Promise<RefreshResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.contactListOverride.deleteMany({ where: { listId, email: normalizeEmail(email) } });
  await db.auditLog.create({
    data: { userId: user.id, action: "list.klymb_override_remove", resource: `list:${listId}`, result: "success" },
  });
  try {
    const stats = await refreshKlymbList(listId, { trigger: "override", userId: user.id });
    revalidateList(listId);
    return { ok: true, stats };
  } catch (err) {
    revalidateList(listId);
    return { ok: false, error: (err as Error).message };
  }
}
