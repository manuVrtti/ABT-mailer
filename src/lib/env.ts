import { z } from "zod";

/**
 * Server-only environment schema. Any variable prefixed NEXT_PUBLIC_ is safe
 * for the browser bundle; everything else stays server-side. This file is
 * imported by server code only — do not import from client components.
 *
 * Empty strings in the process env (e.g. FOO="" in .env) are treated as unset
 * so that .optional() actually kicks in. Without this, `z.string().url()`
 * refuses "" and blocks boot.
 */
const optionalUrl = z.preprocess((v) => (typeof v === "string" && v === "" ? undefined : v), z.string().url().optional());
const optionalEmail = z.preprocess((v) => (typeof v === "string" && v === "" ? undefined : v), z.string().email().optional());
const optionalString = z.preprocess((v) => (typeof v === "string" && v === "" ? undefined : v), z.string().optional());

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Auth
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),

  // Databases
  DATABASE_URL: z.string().url(),
  DIRECT_URL: optionalUrl,
  ABTALKS_DB_URL: optionalUrl,

  // AWS SES
  AWS_REGION: z.string().default("ap-south-1"),
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  SES_FROM_EMAIL: z.string().email(),
  SES_FROM_NAME: z.string().default("ABTalks"),
  SES_REPLY_TO: optionalEmail,
  SES_CONFIGURATION_SET: z.string().min(1),

  // SNS
  SNS_WEBHOOK_SECRET: z.string().min(8),

  // Queue
  QSTASH_TOKEN: optionalString,
  QSTASH_CURRENT_SIGNING_KEY: optionalString,
  QSTASH_NEXT_SIGNING_KEY: optionalString,
  QSTASH_QUEUE_TRANSACTIONAL: z.string().default("priority"),
  QSTASH_QUEUE_MARKETING: z.string().default("bulk"),

  // Transactional API
  TRANSACTIONAL_API_HMAC_SECRET: z.string().min(16),

  // Tokens
  UNSUBSCRIBE_TOKEN_SECRET: z.string().min(16),

  // Cost estimate
  SES_COST_PER_THOUSAND_USD: z.coerce.number().nonnegative().default(0.1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid or missing environment variables:\n  ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** Browser-safe subset. Only NEXT_PUBLIC_* values may live here. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
} as const;
