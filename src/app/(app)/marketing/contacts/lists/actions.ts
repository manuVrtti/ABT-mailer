"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContactSource, Role } from "@prisma/client";
import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/utils";
import { detectColumns, extractContact, isHeaderless, type ExtractedContact } from "@/lib/csv-columns";

import { CONTACT_LIST_COLORS as LIST_COLORS } from "./_constants";

const createListSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z.enum(LIST_COLORS),
});

export async function createList(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const parsed = createListSchema.parse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    color: String(formData.get("color") ?? "emerald"),
  });
  const list = await db.contactList.create({
    data: { name: parsed.name, description: parsed.description, color: parsed.color },
  });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "list.create",
      resource: `list:${list.id}`,
      metadata: { name: parsed.name },
      result: "success",
    },
  });
  revalidatePath("/marketing/contacts/lists");
  redirect(`/marketing/contacts/lists/${list.id}`);
}

export async function updateList(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const id = String(formData.get("id") ?? "");
  const parsed = createListSchema.parse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    color: String(formData.get("color") ?? "emerald"),
  });
  await db.contactList.update({
    where: { id },
    data: { name: parsed.name, description: parsed.description, color: parsed.color },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "list.update", resource: `list:${id}`, result: "success" },
  });
  revalidatePath("/marketing/contacts/lists");
  revalidatePath(`/marketing/contacts/lists/${id}`);
}

export async function deleteList(id: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.contactList.delete({ where: { id } });
  await db.auditLog.create({
    data: { userId: user.id, action: "list.delete", resource: `list:${id}`, result: "success" },
  });
  revalidatePath("/marketing/contacts/lists");
  redirect("/marketing/contacts/lists");
}

/**
 * Bulk add existing contacts to a list by email address. Emails not matching
 * a contact are ignored; duplicates are skipped by the composite PK.
 */
export async function addMembersByEmail(listId: string, rawEmails: string) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const emails = Array.from(
    new Set(
      rawEmails
        .split(/[\s,;\n]+/)
        .map((e) => e.trim())
        .filter(Boolean)
        .map(normalizeEmail),
    ),
  );
  if (emails.length === 0) return { added: 0, notFound: 0 };
  const contacts = await db.marketingContact.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const notFound = emails.length - contacts.length;
  if (contacts.length > 0) {
    await db.contactListMember.createMany({
      data: contacts.map((c) => ({ contactId: c.id, listId })),
      skipDuplicates: true,
    });
  }
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "list.add_members",
      resource: `list:${listId}`,
      metadata: { attempted: emails.length, added: contacts.length, notFound },
      result: "success",
    },
  });
  revalidatePath(`/marketing/contacts/lists/${listId}`);
  return { added: contacts.length, notFound };
}

export type ListImportResult =
  | {
      ok: true;
      rows: number;
      created: number;
      updated: number;
      addedToList: number;
      alreadyInList: number;
      invalid: number;
      duplicates: number;
    }
  | { ok: false; error: string };

const MAX_LIST_CSV_BYTES = 10 * 1024 * 1024;

/**
 * Brevo-style "import contacts into this list": parse the CSV, auto-detect
 * the email + name columns, upsert every contact, then add them all to the
 * list. Existing contacts keep their data unless the CSV provides a value.
 */
export async function importCsvToList(formData: FormData): Promise<ListImportResult> {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const listId = String(formData.get("listId") ?? "");
  const file = formData.get("file");
  if (!listId) return { ok: false, error: "Missing list." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file first." };
  if (file.size > MAX_LIST_CSV_BYTES) return { ok: false, error: "File is larger than 10 MB." };

  const list = await db.contactList.findUnique({ where: { id: listId }, select: { id: true } });
  if (!list) return { ok: false, error: "List not found." };

  const parsed = Papa.parse<string[]>((await file.text()).replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const rows = parsed.data.filter((r) => r.some((c) => c?.trim()));
  if (rows.length === 0) return { ok: false, error: "The CSV is empty." };

  const headerless = isHeaderless(rows[0]!);
  const header = headerless ? [] : rows[0]!;
  const dataRows = headerless ? rows : rows.slice(1);
  const mapping = detectColumns(header, dataRows.slice(0, 50));
  if (mapping.email === undefined) {
    return { ok: false, error: "Couldn't find an email column. Add a header named “email”." };
  }

  const byEmail = new Map<string, ExtractedContact>();
  let invalid = 0;
  let duplicates = 0;
  for (const row of dataRows) {
    const c = extractContact(row, mapping);
    if (!c) {
      invalid++;
      continue;
    }
    if (byEmail.has(c.email)) duplicates++;
    byEmail.set(c.email, { ...byEmail.get(c.email), ...stripUndefined(c) } as ExtractedContact);
  }
  const contacts = [...byEmail.values()];
  const emails = contacts.map((c) => c.email);

  let created = 0;
  let updated = 0;
  const CHUNK = 500;
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK);
    const existing = await db.marketingContact.findMany({
      where: { email: { in: chunk.map((c) => c.email) } },
      select: { email: true },
    });
    const existingSet = new Set(existing.map((e) => e.email));

    const fresh = chunk.filter((c) => !existingSet.has(c.email));
    if (fresh.length > 0) {
      const res = await db.marketingContact.createMany({
        data: fresh.map((c) => ({ ...c, source: ContactSource.IMPORT })),
        skipDuplicates: true,
      });
      created += res.count;
    }

    const toUpdate = chunk.filter((c) => existingSet.has(c.email) && Object.keys(stripUndefined(c)).length > 1);
    for (let j = 0; j < toUpdate.length; j += 50) {
      await db.$transaction(
        toUpdate.slice(j, j + 50).map(({ email, ...fields }) =>
          db.marketingContact.update({ where: { email }, data: stripUndefined(fields) }),
        ),
      );
    }
    updated += toUpdate.length;
  }

  let addedToList = 0;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const ids = await db.marketingContact.findMany({
      where: { email: { in: emails.slice(i, i + CHUNK) } },
      select: { id: true },
    });
    const res = await db.contactListMember.createMany({
      data: ids.map(({ id }) => ({ contactId: id, listId })),
      skipDuplicates: true,
    });
    addedToList += res.count;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "list.import_csv",
      resource: `list:${listId}`,
      metadata: { filename: file.name, rows: dataRows.length, created, updated, addedToList, invalid, duplicates },
      result: "success",
    },
  });
  revalidatePath(`/marketing/contacts/lists/${listId}`);
  revalidatePath("/marketing/contacts/lists");
  revalidatePath("/marketing/contacts");

  return {
    ok: true,
    rows: dataRows.length,
    created,
    updated,
    addedToList,
    alreadyInList: contacts.length - addedToList,
    invalid,
    duplicates,
  };
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

export async function removeMember(listId: string, contactId: string) {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.contactListMember.delete({ where: { contactId_listId: { contactId, listId } } });
  revalidatePath(`/marketing/contacts/lists/${listId}`);
}

// CONTACT_LIST_COLORS is re-exported from ./_constants — do not re-export from
// this "use server" module (Next.js server-action files may only export async
// functions).
