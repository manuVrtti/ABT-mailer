import { NextResponse } from "next/server";
import { z } from "zod";
import { EmailService, ProviderError } from "@/server/email";
import { verifyQStashSignature } from "@/server/queue/verify";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  jobId: z.string().min(1),
  attempt: z.number().int().nonnegative().optional(),
});

/**
 * QStash → worker. Signature-verified. Idempotent by EmailJob idempotencyKey.
 *
 * Retry semantics:
 *   - Retryable errors (throttling, transient) => return 5xx so QStash retries.
 *   - Permanent errors => return 200 to stop retries; the job row is marked FAILED.
 *   - Success => return 200.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyQStashSignature(req, raw);
  if (!ok) {
    logger.warn({ path: "/api/qstash/deliver" }, "qstash.signature.invalid");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  try {
    const result = await EmailService.deliverJob(parsed.jobId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ProviderError) {
      const retryable = err.kind === "throttled" || err.kind === "transient";
      logger.warn({ jobId: parsed.jobId, kind: err.kind, code: err.code }, "qstash.deliver.provider_error");
      if (retryable) {
        // 5xx tells QStash to retry with backoff.
        return NextResponse.json({ error: err.kind, code: err.code }, { status: 503 });
      }
      // Permanent — do not retry.
      return NextResponse.json({ error: err.kind, code: err.code }, { status: 200 });
    }
    logger.error({ jobId: parsed.jobId, err: (err as Error).message }, "qstash.deliver.unexpected");
    // Unknown error: allow retry once by returning 5xx.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
