import { Client } from "@upstash/qstash";
import { getServerEnv } from "@/lib/env";

/**
 * QStash client singleton. Server-only.
 *
 * We name two queues via env — see .env.example — one for transactional
 * (priority) and one for marketing (bulk). Both post to the same worker URL:
 *   POST {NEXT_PUBLIC_APP_URL}/api/qstash/deliver
 *
 * Queue rate limits and parallelism are configured out of band in the QStash
 * dashboard (not in code): the priority queue is unconstrained; the bulk queue
 * is capped to match SES's send rate so a 100k campaign cannot starve
 * transactional email.
 */
let cached: Client | undefined;

export function qstashClient(): Client {
  if (cached) return cached;
  const env = getServerEnv();
  if (!env.QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN is not set — cannot enqueue jobs");
  }
  cached = new Client({ token: env.QSTASH_TOKEN });
  return cached;
}

export function isQStashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN;
}
