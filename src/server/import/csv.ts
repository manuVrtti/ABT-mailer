import Papa from "papaparse";
import { z } from "zod";
import { ContactSource, ImportJobStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * CSV import worker. Runs inside a single Server Action or QStash chunk.
 *
 * Strategy:
 *   * Parse the raw CSV text with papaparse.
 *   * Auto-detect column names against a canonical map (case- and
 *     separator-insensitive: "First Name", "first_name", "firstName" all match).
 *   * Unknown columns are preserved in MarketingContact.meta so nothing is lost.
 *   * Insert rows in batches of BATCH_SIZE with createMany({ skipDuplicates: true }).
 *     Postgres enforces `email` UNIQUE; duplicates from the CSV are counted, not inserted.
 *   * Row-level failures are written to ImportRowError; the job continues.
 *
 * Memory: 100K rows × ~200 bytes ≈ 20 MB. Well within Vercel's 300s / 1GB.
 */

const BATCH_SIZE = 1000;

const canonicalCol: Record<string, string> = {
  email: "email",
  emailaddress: "email",
  email_address: "email",
  firstname: "firstName",
  first_name: "firstName",
  first: "firstName",
  fname: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  last: "lastName",
  lname: "lastName",
  fullname: "fullName",
  full_name: "fullName",
  name: "fullName",
  phone: "phone",
  mobile: "phone",
  phonenumber: "phone",
  phone_number: "phone",
  college: "college",
  institution: "college",
  university: "college",
  branch: "branch",
  department: "branch",
  major: "branch",
  year: "year",
  currentyear: "year",
  current_year: "year",
  graduationyear: "graduationYear",
  graduation_year: "graduationYear",
  passingyear: "graduationYear",
  passing_year: "graduationYear",
  registrationstatus: "registrationStatus",
  registration_status: "registrationStatus",
  source: "source",
};

function canonicalize(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-\.]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

const rowSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional().nullable(),
  lastName: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  college: z.string().max(200).optional().nullable(),
  branch: z.string().max(200).optional().nullable(),
  year: z.string().max(40).optional().nullable(),
  graduationYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  registrationStatus: z.string().max(80).optional().nullable(),
  meta: z.record(z.string()).optional(),
});

export interface CsvImportOutcome {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: Array<{ row: number; reason: string; data: Record<string, string> }>;
}

export async function importCsv(importJobId: string, csvText: string): Promise<CsvImportOutcome> {
  await db.importJob.update({
    where: { id: importJobId },
    data: { status: ImportJobStatus.PARSING },
  });

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    logger.warn({ importJobId, errors: parsed.errors.slice(0, 5) }, "csv.parse.warnings");
  }

  const rows = parsed.data;
  const headers = parsed.meta.fields ?? [];
  const headerMap = new Map<string, string>();
  const unknownHeaders: string[] = [];
  for (const h of headers) {
    const canon = canonicalize(h);
    const mapped = canonicalCol[canon];
    if (mapped) headerMap.set(h, mapped);
    else unknownHeaders.push(h);
  }

  const columnMap = Object.fromEntries([
    ...[...headerMap.entries()].map(([k, v]) => [k, v] as const),
    ...unknownHeaders.map((h) => [h, `meta.${h}`] as const),
  ]);

  await db.importJob.update({
    where: { id: importJobId },
    data: { totalRows: rows.length, columnMap, status: ImportJobStatus.VALIDATING },
  });

  const outcome: CsvImportOutcome = {
    totalRows: rows.length,
    imported: 0,
    duplicates: 0,
    invalid: 0,
    errors: [],
  };

  await db.importJob.update({ where: { id: importJobId }, data: { status: ImportJobStatus.IMPORTING } });

  const seenInBatch = new Set<string>();
  let toInsert: Prisma.MarketingContactCreateManyInput[] = [];
  const errorBuffer: Prisma.ImportRowErrorCreateManyInput[] = [];

  const flush = async () => {
    if (toInsert.length > 0) {
      const res = await db.marketingContact.createMany({ data: toInsert, skipDuplicates: true });
      outcome.imported += res.count;
      outcome.duplicates += toInsert.length - res.count;
      toInsert = [];
    }
    if (errorBuffer.length > 0) {
      await db.importRowError.createMany({ data: errorBuffer });
      errorBuffer.length = 0;
    }
    await db.importJob.update({
      where: { id: importJobId },
      data: {
        processed: outcome.imported + outcome.duplicates + outcome.invalid,
        imported: outcome.imported,
        duplicates: outcome.duplicates,
        invalid: outcome.invalid,
      },
    });
  };

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]!;
    const record: Record<string, unknown> = { meta: {} as Record<string, string> };

    for (const [h, val] of Object.entries(raw)) {
      const mapped = headerMap.get(h);
      if (mapped) record[mapped] = val;
      else if (val && val.trim()) (record.meta as Record<string, string>)[h] = val;
    }

    // Split full name if firstName/lastName not present.
    if (!record.firstName && !record.lastName && record.fullName) {
      const [fn, ...rest] = String(record.fullName).trim().split(/\s+/);
      record.firstName = fn ?? "";
      record.lastName = rest.join(" ") || undefined;
    }

    // Normalize email early.
    if (typeof record.email === "string") record.email = normalizeEmail(record.email);

    const parsedRow = rowSchema.safeParse(record);
    if (!parsedRow.success) {
      outcome.invalid++;
      const reason = parsedRow.error.issues[0]?.message ?? "invalid";
      errorBuffer.push({
        importJobId,
        rowNumber: i + 2, // account for header row
        rowData: raw as unknown as Prisma.InputJsonValue,
        reason,
      });
      if (outcome.errors.length < 50) outcome.errors.push({ row: i + 2, reason, data: raw });
      continue;
    }

    const clean = parsedRow.data;
    if (seenInBatch.has(clean.email)) {
      // Duplicate within this file — count and skip. DB unique still deduplicates across files.
      outcome.duplicates++;
      continue;
    }
    seenInBatch.add(clean.email);

    toInsert.push({
      email: clean.email,
      firstName: clean.firstName ?? undefined,
      lastName: clean.lastName ?? undefined,
      phone: clean.phone ?? undefined,
      college: clean.college ?? undefined,
      branch: clean.branch ?? undefined,
      year: clean.year ?? undefined,
      graduationYear: clean.graduationYear ?? undefined,
      registrationStatus: clean.registrationStatus ?? undefined,
      source: ContactSource.IMPORT,
      meta: clean.meta && Object.keys(clean.meta).length > 0 ? (clean.meta as Prisma.InputJsonValue) : Prisma.DbNull,
    });

    if (toInsert.length >= BATCH_SIZE) await flush();
  }

  await flush();

  await db.importJob.update({
    where: { id: importJobId },
    data: { status: ImportJobStatus.COMPLETED, completedAt: new Date() },
  });

  return outcome;
}
