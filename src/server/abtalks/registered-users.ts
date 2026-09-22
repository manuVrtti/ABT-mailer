import { Pool, type PoolClient } from "pg";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils";

/**
 * Read-only bridge into the ABTalks main Postgres. This module is the ONLY
 * place that talks to ABTALKS_DB_URL. Its job is to project the fields we
 * need into RegisteredUserRef so segments and analytics can join against them
 * without ever writing to the ABTalks DB.
 *
 * The ABTalks schema is not committed here yet; adjust QUERY to match your
 * users table when you first wire this up. Fields required at minimum:
 *   - id (upstream primary key, stringified as abtalksUserId)
 *   - email
 *
 * Sync semantics:
 *   * Runs cursor-paginated, batched upserts. Safe to run repeatedly.
 *   * Emails are normalized (lowercased). Duplicates upstream collapse to the
 *     latest row seen in this run.
 *   * A row that disappears upstream stays in RegisteredUserRef — we don't
 *     hard-delete; the ABTalks main DB stays source of truth for existence,
 *     and stale projections just fail to send if the email is later suppressed.
 */

const BATCH_SIZE = 500;

// TODO: replace this SQL with the actual columns on your ABTalks users table.
// Rename the CTE aliases (email, first_name, ...) to whatever the source uses,
// or wrap the source with a Postgres VIEW called `abt_registered_users_v` and
// keep this file untouched.
const QUERY = `
  SELECT
    id::text        AS abtalks_user_id,
    email,
    first_name,
    last_name,
    college,
    branch,
    year,
    updated_at
  FROM abt_registered_users_v
  WHERE ($1::timestamp IS NULL OR updated_at > $1)
  ORDER BY updated_at ASC
  LIMIT ${BATCH_SIZE}
  OFFSET $2
`;

type UpstreamRow = {
  abtalks_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  updated_at: Date;
};

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.ABTALKS_DB_URL;
  if (!url) throw new Error("ABTALKS_DB_URL is not set");
  pool = new Pool({ connectionString: url, max: 4, application_name: "abt-mailer-readonly" });
  return pool;
}

export interface SyncOutcome {
  fetched: number;
  upserted: number;
  errors: number;
  lastSyncedAt?: Date;
}

/**
 * One pass of the sync. Uses the max `synced_at` across our local
 * RegisteredUserRef rows as the incremental cursor. If nothing is stored yet,
 * pulls everything from the source.
 */
export async function syncRegisteredUsers(): Promise<SyncOutcome> {
  if (!process.env.ABTALKS_DB_URL) {
    logger.warn("registered_users_sync.skipped — ABTALKS_DB_URL not configured");
    return { fetched: 0, upserted: 0, errors: 0 };
  }

  const client: PoolClient = await getPool().connect();
  const outcome: SyncOutcome = { fetched: 0, upserted: 0, errors: 0 };
  try {
    // Incremental cursor: the highest syncedAt we've stored.
    const cursor = await db.registeredUserRef.aggregate({ _max: { syncedAt: true } });
    let offset = 0;
    for (;;) {
      const { rows } = await client.query<UpstreamRow>(QUERY, [cursor._max.syncedAt ?? null, offset]);
      if (rows.length === 0) break;
      outcome.fetched += rows.length;

      const upserts = rows.map((r) =>
        db.registeredUserRef.upsert({
          where: { abtalksUserId: r.abtalks_user_id },
          update: {
            email: normalizeEmail(r.email),
            firstName: r.first_name ?? undefined,
            lastName: r.last_name ?? undefined,
            college: r.college ?? undefined,
            branch: r.branch ?? undefined,
            year: r.year ?? undefined,
            syncedAt: new Date(),
          },
          create: {
            abtalksUserId: r.abtalks_user_id,
            email: normalizeEmail(r.email),
            firstName: r.first_name ?? undefined,
            lastName: r.last_name ?? undefined,
            college: r.college ?? undefined,
            branch: r.branch ?? undefined,
            year: r.year ?? undefined,
            syncedAt: new Date(),
          },
        }),
      );
      try {
        await db.$transaction(upserts satisfies Prisma.PrismaPromise<unknown>[]);
        outcome.upserted += rows.length;
      } catch (err) {
        outcome.errors += rows.length;
        logger.error({ err, offset, batchSize: rows.length }, "registered_users_sync.batch_failed");
      }

      if (rows.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
    outcome.lastSyncedAt = new Date();
    logger.info(outcome, "registered_users_sync.complete");
    return outcome;
  } finally {
    client.release();
  }
}
