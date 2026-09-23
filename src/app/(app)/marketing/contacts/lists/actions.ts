"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/utils";

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

export async function removeMember(listId: string, contactId: string) {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  await db.contactListMember.delete({ where: { contactId_listId: { contactId, listId } } });
  revalidatePath(`/marketing/contacts/lists/${listId}`);
}

// CONTACT_LIST_COLORS is re-exported from ./_constants — do not re-export from
// this "use server" module (Next.js server-action files may only export async
// functions).
