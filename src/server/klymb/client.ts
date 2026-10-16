import { Pool } from "pg";
import { logger } from "@/lib/logger";

/**
 * Read-only access to the Klymb (ABTalks main app) Postgres. This module is
 * the ONLY place that opens ABTALKS_DB_URL for live lists.
 *
 * The URL may carry a user with write rights, so read-only is enforced here,
 * three ways, independent of the role:
 *   1. Every call runs inside `BEGIN TRANSACTION READ ONLY`. Postgres itself
 *      rejects INSERT / UPDATE / DELETE / DDL inside it.
 *   2. The transaction always ends in ROLLBACK, never COMMIT.
 *   3. `assertReadOnlySql` refuses any statement that is not a single
 *      SELECT / WITH … SELECT, before it reaches the driver.
 * Plus a statement timeout, so a heavy filter can't slow the Klymb app down.
 *
 * Neon's pooler rejects startup parameters, so the timeout is SET LOCAL inside
 * the transaction rather than passed as a connection option.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

export class KlymbNotConfiguredError extends Error {
  constructor() {
    super("The Klymb database is not connected (ABTALKS_DB_URL is not set).");
  }
}

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.ABTALKS_DB_URL;
  if (!url) throw new KlymbNotConfiguredError();
  pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    application_name: "abt-mailer-readonly",
  });
  pool.on("error", (err) => logger.error({ err }, "klymb_db.pool_error"));
  return pool;
}

export function isKlymbConfigured(): boolean {
  return Boolean(process.env.ABTALKS_DB_URL);
}

const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|copy|vacuum|analyze|reindex|cluster|comment|lock|call|do|set|reset|listen|notify|prepare|execute|refresh|security|import)\b/i;

/**
 * Throws unless `sql` is a single read statement. Defence in depth on top of
 * the READ ONLY transaction — that one is what Postgres enforces.
 */
export function assertReadOnlySql(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // Quoted identifiers and string literals may legitimately contain words
    // like "update"; only the statement's own keywords matter here.
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/'(?:[^']|'')*'/g, "''")
    .trim();
  if (!/^(select|with)\b/i.test(stripped)) throw new Error("Klymb queries must be SELECT statements");
  if (stripped.replace(/;\s*$/, "").includes(";")) throw new Error("Klymb queries must be a single statement");
  if (WRITE_KEYWORDS.test(stripped)) throw new Error("Klymb queries must not contain write keywords");
}

export type ReadQuery = <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;

/** Run `fn` with a query function bound to one read-only, rolled-back transaction. */
export async function klymbRead<T>(
  fn: (query: ReadQuery) => Promise<T>,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const timeout = Math.max(1000, Math.min(120_000, Math.floor(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)));
  const client = await getPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${timeout}`);
    const query: ReadQuery = async (text, values) => {
      assertReadOnlySql(text);
      const res = await client.query(text, values);
      return res.rows;
    };
    return await fn(query);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
