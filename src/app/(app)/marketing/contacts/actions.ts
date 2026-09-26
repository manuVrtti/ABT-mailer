"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Role, ImportJobStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { importCsv } from "@/server/import/csv";
import { logger } from "@/lib/logger";

const MAX_CSV_BYTES = 20 * 1024 * 1024; // 20 MB

export async function startCsvImport(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded");
  if (file.size === 0) throw new Error("File is empty");
  if (file.size > MAX_CSV_BYTES) throw new Error(`File exceeds ${MAX_CSV_BYTES / (1024 * 1024)}MB`);

  const csvText = await file.text();

  const job = await db.importJob.create({
    data: {
      filename: file.name,
      status: ImportJobStatus.PENDING,
      createdById: user.id,
    },
  });

  // Run inline for now. When QStash chunk workers land (Phase 13-ish extension),
  // the parse can be split across multiple invocations. In practice a single
  // Vercel function handles 100K rows well under the 300s cap.
  // Awaited: on Vercel an un-awaited promise is dropped once the response ships.
  await importCsv(job.id, csvText).catch(async (err) => {
    logger.error({ err, importJobId: job.id }, "csv.import.failed");
    await db.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.FAILED, error: (err as Error).message },
    });
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "contact.import.start",
      resource: `import:${job.id}`,
      metadata: { filename: file.name, size: file.size },
      result: "success",
    },
  });

  revalidatePath("/marketing/contacts/imports");
  redirect(`/marketing/contacts/imports/${job.id}`);
}

const singleSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  college: z.string().max(200).optional(),
  branch: z.string().max(200).optional(),
  year: z.string().max(40).optional(),
});

export async function createContactManually(formData: FormData) {
  const user = await requireRole([Role.ADMIN, Role.MARKETER]);
  const parsed = singleSchema.parse({
    email: formData.get("email"),
    firstName: formData.get("firstName") || undefined,
    lastName: formData.get("lastName") || undefined,
    phone: formData.get("phone") || undefined,
    college: formData.get("college") || undefined,
    branch: formData.get("branch") || undefined,
    year: formData.get("year") || undefined,
  });
  await db.marketingContact.upsert({
    where: { email: parsed.email.toLowerCase() },
    update: { ...parsed, email: parsed.email.toLowerCase() },
    create: { ...parsed, email: parsed.email.toLowerCase(), source: "MANUAL" },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: "contact.create", resource: `contact:${parsed.email}`, result: "success" },
  });
  revalidatePath("/marketing/contacts");
  redirect("/marketing/contacts");
}
