import {
  DirectSendKind,
  DirectSendStatus,
  EmailCategory,
  EmailJobStatus,
  EmailType,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { brandForAddress, listBrands, senderBrand, type BrandInfo } from "@/server/brands";
import { checkSuppressionBulk } from "@/server/email/suppression";
import { sanitizeHtml } from "@/server/email/render";
import { unsubscribeUrl } from "@/server/unsubscribe/token";
import { enqueueDeliveries } from "@/server/queue/publish";
import { buildRowEmail, DIRECT_SEND_LIMITS, escapeHtml, findFiles, formatBytes, type BuiltEmail } from "./body";
import { completeDirectSendIfDone } from "./complete";

const CHUNK = 500;

export function directSendIdempotencyKey(directSendId: string, rowNumber: number): string {
  return `direct:${directSendId}:${rowNumber}`;
}

function categoryFor(kind: DirectSendKind) {
  return kind === DirectSendKind.MARKETING
    ? { emailType: EmailType.MARKETING, category: EmailCategory.MARKETING }
    : { emailType: EmailType.TRANSACTIONAL, category: EmailCategory.TRANSACTIONAL_NONESSENTIAL };
}

/** The final subject / html / text for one row, as it will be sent. */
export function renderDirectEmail(
  send: { id: string; kind: DirectSendKind },
  row: { email: string; subject: string; body: string; variables: Prisma.JsonValue },
  brand: BrandInfo,
): BuiltEmail {
  const vars = (row.variables && typeof row.variables === "object" && !Array.isArray(row.variables)
    ? row.variables
    : {}) as Record<string, string>;
  const built = buildRowEmail({ subject: row.subject, body: row.body, variables: vars });
  let html = sanitizeHtml(built.html);
  if (send.kind === DirectSendKind.MARKETING) {
    const url = unsubscribeUrl({ email: row.email, category: EmailCategory.MARKETING, brandKey: brand.key });
    html += `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eaeaea;font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif;">${escapeHtml(brand.name)} · This email was sent to ${escapeHtml(row.email)}. <a href="${url}" style="color:#888;text-decoration:underline;">Unsubscribe</a>.</div>`;
  }
  return { ...built, html };
}

/** Attachments a row gets: every "attach to everyone" file plus the ones it names. */
export function attachmentsForRow<T extends { filename: string; forAll: boolean }>(
  attachments: T[],
  names: string[],
): { files: T[]; missing: string[] } {
  const files = new Map<string, T>();
  for (const a of attachments) if (a.forAll) files.set(a.filename.toLowerCase(), a);
  const missing: string[] = [];
  for (const n of names) {
    const found = findFiles(n, attachments, (a) => a.filename);
    if (found.length === 0) missing.push(n);
    for (const a of found) files.set(a.filename.toLowerCase(), a);
  }
  return { files: [...files.values()], missing };
}

export interface LaunchProblem {
  rowNumber: number;
  email: string;
  problem: string;
}

/** Everything that would stop a batch from sending, or [] when it's ready. */
export async function checkDirectSendReady(directSendId: string): Promise<LaunchProblem[]> {
  const send = await db.directSend.findUnique({
    where: { id: directSendId },
    select: {
      fromEmail: true,
      rows: { select: { rowNumber: true, email: true, attachmentNames: true }, orderBy: { rowNumber: "asc" } },
      attachments: { select: { filename: true, forAll: true, size: true } },
    },
  });
  if (!send) return [{ rowNumber: 0, email: "", problem: "Batch not found" }];
  const problems: LaunchProblem[] = [];
  if (!senderBrand(await listBrands(), send.fromEmail)) {
    problems.push({ rowNumber: 0, email: "", problem: `${send.fromEmail} is not on a domain verified in SES` });
  }
  if (send.rows.length === 0) problems.push({ rowNumber: 0, email: "", problem: "No rows to send" });
  for (const r of send.rows) {
    const { files, missing } = attachmentsForRow(send.attachments, r.attachmentNames);
    if (missing.length) problems.push({ rowNumber: r.rowNumber, email: r.email, problem: `Missing file: ${missing.join(", ")}` });
    const bytes = files.reduce((n, f) => n + f.size, 0);
    if (bytes > DIRECT_SEND_LIMITS.messageBytes) {
      problems.push({
        rowNumber: r.rowNumber,
        email: r.email,
        problem: `Attachments total ${formatBytes(bytes)} (max ${formatBytes(DIRECT_SEND_LIMITS.messageBytes)})`,
      });
    }
  }
  return problems;
}

/**
 * Turn every row into an EmailJob and queue them. Suppressed addresses get a
 * SKIPPED job (so the row shows why). Idempotent per row: a retried launch
 * never creates a second job for the same row.
 */
export async function launchDirectSend(directSendId: string): Promise<{ queued: number; skipped: number }> {
  const send = await db.directSend.findUnique({
    where: { id: directSendId },
    include: { attachments: { select: { id: true, filename: true, forAll: true } } },
  });
  if (!send) throw new Error("Batch not found");
  if (send.status !== DirectSendStatus.DRAFT) throw new Error(`This batch is already ${send.status.toLowerCase()}`);

  const problems = await checkDirectSendReady(directSendId);
  if (problems.length) {
    throw new Error(
      `Fix ${problems.length} problem${problems.length === 1 ? "" : "s"} first: ` +
        problems
          .slice(0, 3)
          .map((p) => (p.rowNumber ? `row ${p.rowNumber}: ${p.problem}` : p.problem))
          .join("; "),
    );
  }

  // Claim the batch so a double click can't launch it twice.
  const claimed = await db.directSend.updateMany({
    where: { id: directSendId, status: DirectSendStatus.DRAFT },
    data: { status: DirectSendStatus.SENDING, startedAt: new Date() },
  });
  if (claimed.count === 0) throw new Error("This batch is already sending");

  const brand = await brandForAddress(send.fromEmail);
  const { emailType, category } = categoryFor(send.kind);
  let queued = 0;
  let skipped = 0;
  let cursor = 0;

  try {
    for (;;) {
      const rows = await db.directSendRow.findMany({
        where: { directSendId, rowNumber: { gt: cursor } },
        orderBy: { rowNumber: "asc" },
        take: CHUNK,
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1]!.rowNumber;

      const suppression = await checkSuppressionBulk(
        rows.map((r) => r.email),
        category,
        brand.key,
      );
      const data: Prisma.EmailJobCreateManyInput[] = rows.map((r) => {
        const decision = suppression.get(r.email) ?? { allowed: true };
        const email = renderDirectEmail(send, r, brand);
        return {
          idempotencyKey: directSendIdempotencyKey(directSendId, r.rowNumber),
          emailType,
          category,
          status: decision.allowed ? EmailJobStatus.PENDING : EmailJobStatus.SKIPPED,
          recipientEmail: r.email,
          directSendId,
          attachmentIds: attachmentsForRow(send.attachments, r.attachmentNames).files.map((a) => a.id),
          eventType: "personal_mail",
          subject: email.subject,
          fromEmail: send.fromEmail,
          fromName: send.fromName,
          replyTo: send.replyTo,
          variables: {} as Prisma.InputJsonValue,
          renderedHtml: email.html,
          renderedText: email.text,
          errorCode: decision.allowed ? null : "suppressed",
          errorMessage: decision.allowed ? null : decision.reason ?? null,
        };
      });
      await db.emailJob.createMany({ data, skipDuplicates: true });

      const jobs = await db.emailJob.findMany({
        where: { idempotencyKey: { in: data.map((d) => d.idempotencyKey) } },
        select: { id: true, idempotencyKey: true, status: true, queuedAt: true },
      });
      const links = JSON.stringify(
        jobs.map((j) => ({ row_number: Number(j.idempotencyKey.split(":").pop()), job_id: j.id })),
      );
      await db.$executeRaw`
        UPDATE direct_send_rows AS r SET email_job_id = v.job_id
        FROM jsonb_to_recordset(${links}::jsonb) AS v(row_number int, job_id text)
        WHERE r.direct_send_id = ${directSendId} AND r.row_number = v.row_number`;

      const toQueue = jobs.filter((j) => j.status === EmailJobStatus.PENDING && !j.queuedAt).map((j) => j.id);
      skipped += jobs.filter((j) => j.status === EmailJobStatus.SKIPPED).length;
      queued += await enqueueDeliveries(toQueue);
    }
  } catch (err) {
    // Jobs already created keep going; the rest can be retried from the page.
    logger.error({ err, directSendId }, "direct_send.launch_failed");
    throw new Error(`Sending stopped part-way: ${(err as Error).message}. Open the batch to retry.`);
  } finally {
    await completeDirectSendIfDone(directSendId).catch(() => {});
  }
  logger.info({ directSendId, queued, skipped }, "direct_send.launched");
  return { queued, skipped };
}

/** Stop a sending batch: jobs not yet handed to SES are skipped. */
export async function cancelDirectSend(directSendId: string): Promise<number> {
  await db.directSend.updateMany({
    where: { id: directSendId, status: { in: [DirectSendStatus.DRAFT, DirectSendStatus.SENDING] } },
    data: { status: DirectSendStatus.CANCELLED, completedAt: new Date() },
  });
  const res = await db.emailJob.updateMany({
    where: { directSendId, status: { in: [EmailJobStatus.PENDING, EmailJobStatus.QUEUED] } },
    data: { status: EmailJobStatus.SKIPPED, errorCode: "batch_cancelled" },
  });
  return res.count;
}
