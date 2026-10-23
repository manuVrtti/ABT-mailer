"use server";

import { revalidatePath } from "next/cache";
import { DirectSendKind, DirectSendStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/utils";
import { brandForAddress, listBrands, senderBrand } from "@/server/brands";
import { EmailService } from "@/server/email";
import { checkRows, DIRECT_SEND_LIMITS, isBlocking, ISSUE_LABELS } from "@/server/direct-send/body";
import {
  attachmentsForRow,
  cancelDirectSend,
  launchDirectSend,
  MAX_SINGLE_RECIPIENTS,
  renderDirectEmail,
} from "@/server/direct-send/service";
import { canSendAs, currentScope } from "@/server/access/scope";
import { requirePermission } from "@/server/access/permissions";

const PATH = "/marketing/customize";

/** Batch actions only work on batches sent from this person's brands. */
async function hasBatchAccess(id: string): Promise<boolean> {
  const b = await db.directSend.findUnique({ where: { id }, select: { fromEmail: true } });
  return Boolean(b) && canSendAs(await currentScope(), b!.fromEmail);
}

const rowSchema = z.object({
  rowNumber: z.number().int().positive(),
  email: z.string().max(254),
  name: z.string().max(300),
  subject: z.string().max(DIRECT_SEND_LIMITS.subjectChars),
  body: z.string().max(DIRECT_SEND_LIMITS.bodyChars),
  attachmentNames: z.array(z.string().max(255)).max(20),
  variables: z.record(z.string().max(255), z.string().max(DIRECT_SEND_LIMITS.bodyChars)),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the batch a name").max(200),
  kind: z.nativeEnum(DirectSendKind),
  fromEmail: z.string().email("Pick a sender"),
  /** Names of the files the browser is about to upload. */
  fileNames: z.array(z.string().max(255)).max(500),
  rows: z.array(rowSchema).min(1, "The CSV has no rows").max(DIRECT_SEND_LIMITS.rows),
});

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

/** Save a checked CSV as a DRAFT batch. Files are uploaded separately, one per request. */
export async function createDirectSend(json: string): Promise<CreateResult> {
  const user = await requirePermission("personal.manage");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "Couldn't read the upload." };
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid upload" };
  const input = parsed.data;

  if (!canSendAs(await currentScope(), input.fromEmail)) {
    return { ok: false, error: `You don't have access to send as ${input.fromEmail}.` };
  }
  const brand = senderBrand(await listBrands(), input.fromEmail);
  if (!brand) return { ok: false, error: `${input.fromEmail} isn't on a domain verified in SES.` };

  const rows = input.rows.map((r) => ({ ...r, email: normalizeEmail(r.email) }));
  const issues = checkRows(rows, input.fileNames);
  const blocked = rows.filter((r) => isBlocking(issues.get(r.rowNumber)));
  if (blocked.length) {
    const first = blocked[0]!;
    return {
      ok: false,
      error: `${blocked.length} row(s) can't be sent — e.g. row ${first.rowNumber}: ${issues
        .get(first.rowNumber)!
        .map((i) => ISSUE_LABELS[i])
        .join(", ")}.`,
    };
  }

  const send = await db.directSend.create({
    data: {
      name: input.name,
      kind: input.kind,
      fromEmail: normalizeEmail(input.fromEmail),
      fromName: brand.fromName,
      replyTo: brand.replyTo,
      totalRows: rows.length,
      createdById: user.id,
    },
  });
  for (let i = 0; i < rows.length; i += 500) {
    await db.directSendRow.createMany({
      data: rows.slice(i, i + 500).map((r) => ({
        directSendId: send.id,
        rowNumber: r.rowNumber,
        email: r.email,
        name: r.name || null,
        subject: r.subject,
        body: r.body,
        variables: r.variables as Prisma.InputJsonValue,
        attachmentNames: r.attachmentNames,
      })),
    });
  }
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "direct_send.create",
      resource: `direct_send:${send.id}`,
      metadata: { name: send.name, rows: rows.length, kind: send.kind, files: input.fileNames.length },
      result: "success",
    },
  });
  revalidatePath(PATH);
  return { ok: true, id: send.id };
}

// ---------------------------------------------------------------------------
// Single email: one message to any address, with CC / BCC.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const addressList = z.array(z.string().max(254)).max(MAX_SINGLE_RECIPIENTS);

const singleSchema = z.object({
  id: z.string().max(40).optional(),
  fromEmail: z.string().email("Pick a sender"),
  to: addressList,
  cc: addressList,
  bcc: addressList,
  subject: z.string().trim().min(1, "Add a subject").max(DIRECT_SEND_LIMITS.subjectChars),
  body: z
    .string()
    .max(DIRECT_SEND_LIMITS.bodyChars)
    .refine((b) => b.trim().length > 0, "Write a message"),
});

export type SingleInput = z.input<typeof singleSchema>;

/** Clean the three address lists: lower-case, no duplicates, each address in one list only (To > CC > BCC). */
function cleanRecipients(to: string[], cc: string[], bcc: string[]) {
  const seen = new Set<string>();
  const bad: string[] = [];
  const take = (list: string[]) =>
    list
      .map((e) => normalizeEmail(e))
      .filter((e) => {
        if (!e) return false;
        if (!EMAIL_RE.test(e)) {
          bad.push(e);
          return false;
        }
        if (seen.has(e)) return false;
        seen.add(e);
        return true;
      });
  return { to: take(to), cc: take(cc), bcc: take(bcc), bad };
}

/** Save a single email as a draft (new, or an existing draft). Files are uploaded separately. */
export async function saveSingleMail(input: SingleInput): Promise<CreateResult> {
  const user = await requirePermission("personal.manage");
  const parsed = singleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email" };
  const d = parsed.data;

  const r = cleanRecipients(d.to, d.cc, d.bcc);
  if (r.bad.length) return { ok: false, error: `Not a valid email address: ${r.bad.slice(0, 3).join(", ")}` };
  if (r.to.length === 0) return { ok: false, error: "Add at least one To address." };
  const total = r.to.length + r.cc.length + r.bcc.length;
  if (total > MAX_SINGLE_RECIPIENTS) {
    return {
      ok: false,
      error: `${total} recipients — one email can go to at most ${MAX_SINGLE_RECIPIENTS}.`,
    };
  }
  if (!canSendAs(await currentScope(), d.fromEmail)) {
    return { ok: false, error: `You don't have access to send as ${d.fromEmail}.` };
  }
  const brand = senderBrand(await listBrands(), d.fromEmail);
  if (!brand) return { ok: false, error: `${d.fromEmail} isn't on a domain verified in SES.` };

  const fields = {
    name: d.subject.slice(0, 200),
    kind: DirectSendKind.PERSONAL,
    single: true,
    fromEmail: normalizeEmail(d.fromEmail),
    fromName: brand.fromName,
    replyTo: brand.replyTo,
    totalRows: 1,
    toEmails: r.to,
    ccEmails: r.cc,
    bccEmails: r.bcc,
  };
  const row = {
    email: r.to[0]!,
    name: null,
    subject: d.subject,
    body: d.body,
    variables: {} as Prisma.InputJsonValue,
  };

  let id = d.id;
  if (id) {
    if (!(await hasBatchAccess(id))) return { ok: false, error: "Email not found." };
    const existing = await db.directSend.findUnique({
      where: { id },
      select: { single: true, status: true },
    });
    if (!existing?.single) return { ok: false, error: "Email not found." };
    if (existing.status !== DirectSendStatus.DRAFT)
      return { ok: false, error: "This email was already sent." };
    await db.$transaction([
      db.directSend.update({ where: { id }, data: fields }),
      db.directSendRow.upsert({
        where: { directSendId_rowNumber: { directSendId: id, rowNumber: 1 } },
        create: { directSendId: id, rowNumber: 1, ...row },
        update: row,
      }),
    ]);
  } else {
    const send = await db.directSend.create({
      data: { ...fields, createdById: user.id, rows: { create: { rowNumber: 1, ...row } } },
    });
    id = send.id;
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "direct_send.create_single",
        resource: `direct_send:${id}`,
        metadata: { to: r.to.length, cc: r.cc.length, bcc: r.bcc.length },
        result: "success",
      },
    });
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { ok: true, id };
}

export type UploadResult =
  | { ok: true; attachment: { id: string; filename: string; size: number; forAll: boolean } }
  | { ok: false; error: string };

/** One attachment per call — Vercel caps a request at ~4.5 MB. Same name replaces the old file. */
export async function uploadDirectSendAttachment(formData: FormData): Promise<UploadResult> {
  await requirePermission("personal.manage");
  const id = String(formData.get("id") ?? "");
  if (!(await hasBatchAccess(id))) return { ok: false, error: "Batch not found." };
  const file = formData.get("file");
  const forAll = formData.get("forAll") === "1";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Empty file." };
  if (file.size > DIRECT_SEND_LIMITS.fileBytes) {
    return { ok: false, error: `${file.name} is larger than 4 MB.` };
  }
  const send = await db.directSend.findUnique({ where: { id }, select: { status: true } });
  if (!send) return { ok: false, error: "Batch not found." };
  if (send.status !== DirectSendStatus.DRAFT)
    return { ok: false, error: "Files can only change before sending." };

  const filename = file.name.replace(/[\\/]/g, "_").slice(0, 200);
  const data = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const a = await db.mailAttachment.upsert({
    where: { directSendId_filename: { directSendId: id, filename } },
    create: { directSendId: id, filename, contentType, size: file.size, forAll, data },
    update: { contentType, size: file.size, forAll, data },
    select: { id: true, filename: true, size: true, forAll: true },
  });
  revalidatePath(`${PATH}/${id}`);
  return { ok: true, attachment: a };
}

export async function setAttachmentForAll(id: string, attachmentId: string, forAll: boolean) {
  await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id))) return;
  await db.mailAttachment.updateMany({
    where: { id: attachmentId, directSendId: id, directSend: { status: DirectSendStatus.DRAFT } },
    data: { forAll },
  });
  revalidatePath(`${PATH}/${id}`);
}

export async function deleteDirectSendAttachment(id: string, attachmentId: string) {
  await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id))) return;
  await db.mailAttachment.deleteMany({
    where: { id: attachmentId, directSendId: id, directSend: { status: DirectSendStatus.DRAFT } },
  });
  revalidatePath(`${PATH}/${id}`);
}

export type SimpleResult = { ok: true; message: string } | { ok: false; error: string };

/** Send one row's email, with its attachments, to `to` — marked [TEST]. */
export async function sendDirectSendTest(id: string, rowNumber: number, to: string): Promise<SimpleResult> {
  await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id))) return { ok: false, error: "Batch not found." };
  const address = normalizeEmail(to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: "Enter a valid email." };
  const send = await db.directSend.findUnique({
    where: { id },
    include: { attachments: true, rows: { where: { rowNumber }, take: 1 } },
  });
  const row = send?.rows[0];
  if (!send || !row) return { ok: false, error: "Row not found." };
  const brand = await brandForAddress(send.fromEmail);
  const email = renderDirectEmail(send, row, brand);
  const { files, missing } = attachmentsForRow(send.attachments, row.attachmentNames);
  if (missing.length) return { ok: false, error: `Missing file: ${missing.join(", ")}` };
  try {
    await EmailService.sendTest({
      to: address,
      subject: email.subject,
      html: email.html,
      text: email.text,
      fromEmail: send.fromEmail,
      fromName: send.fromName,
      replyTo: send.replyTo ?? undefined,
      attachments: files.map((f) => ({
        filename: f.filename,
        contentType: f.contentType,
        content: new Uint8Array(f.data),
      })),
    });
    return { ok: true, message: `Row ${rowNumber}'s email sent to ${address}.` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function launchDirectSendAction(id: string): Promise<SimpleResult> {
  const user = await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id)))
    return { ok: false, error: "You don't have access to this batch's sender." };
  try {
    const r = await launchDirectSend(id);
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "direct_send.launch",
        resource: `direct_send:${id}`,
        metadata: r,
        result: "success",
      },
    });
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return {
      ok: true,
      message: `${r.queued} email${r.queued === 1 ? "" : "s"} queued${r.skipped ? `, ${r.skipped} skipped (unsubscribed or bounced before)` : ""}.`,
    };
  } catch (err) {
    revalidatePath(`${PATH}/${id}`);
    return { ok: false, error: (err as Error).message };
  }
}

export async function cancelDirectSendAction(id: string): Promise<SimpleResult> {
  const user = await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id)))
    return { ok: false, error: "You don't have access to this batch's sender." };
  const n = await cancelDirectSend(id);
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "direct_send.cancel",
      resource: `direct_send:${id}`,
      metadata: { skipped: n },
      result: "success",
    },
  });
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
  return { ok: true, message: `Cancelled — ${n} unsent email${n === 1 ? "" : "s"} skipped.` };
}

export async function deleteDirectSend(id: string): Promise<SimpleResult> {
  const user = await requirePermission("personal.manage");
  if (!(await hasBatchAccess(id)))
    return { ok: false, error: "You don't have access to this batch's sender." };
  const send = await db.directSend.findUnique({ where: { id }, select: { status: true, name: true } });
  if (!send) return { ok: false, error: "Batch not found." };
  if (send.status === DirectSendStatus.SENDING)
    return { ok: false, error: "Cancel the batch before deleting it." };
  // Sent emails keep their log rows; only the batch, its rows and files go.
  await db.emailJob.updateMany({ where: { directSendId: id }, data: { attachmentIds: [] } });
  await db.directSend.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "direct_send.delete",
      resource: `direct_send:${id}`,
      metadata: { name: send.name },
      result: "success",
    },
  });
  revalidatePath(PATH);
  return { ok: true, message: "Deleted." };
}
