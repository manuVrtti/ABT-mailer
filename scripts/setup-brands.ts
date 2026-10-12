/* eslint-disable no-console -- CLI script: printing is its output */
/**
 * One-time setup for multi-brand sending. Run after `prisma db push` has added
 * the brands table and suppressions.brand_key:
 *
 *   npx tsx --env-file=.env scripts/setup-brands.ts            # dry run, prints what it would do
 *   npx tsx --env-file=.env scripts/setup-brands.ts --apply    # does it
 *
 * Idempotent. It:
 *   1. creates the ABTalks brand from the current env sender (already sending,
 *      so marked verified) and makes it the default if no default exists;
 *   2. creates the Klymb brand, NOT verified — use "Check SES" in Settings →
 *      Senders once klymb.ai is verified in SES, then "Make default";
 *   3. tags existing unsubscribes and complaints (all from ABTalks mail) with
 *      brand "abtalks", so they keep blocking ABTalks marketing but not Klymb.
 *      Hard bounces and manual blocks stay on every brand.
 */
import { PrismaClient, SuppressionReason } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const envFrom = (process.env.SES_FROM_EMAIL ?? "").toLowerCase();
  const envDomain = envFrom.split("@")[1];
  if (!envDomain) throw new Error("SES_FROM_EMAIL is not set");

  const brands = [
    {
      key: "abtalks",
      name: "ABTalks",
      domain: envDomain,
      fromName: process.env.SES_FROM_NAME || "ABTalks",
      fromAddresses: Array.from(new Set([envFrom, `team@${envDomain}`, `no-reply@${envDomain}`])),
      replyTo: process.env.SES_REPLY_TO || `team@${envDomain}`,
      websiteUrl: `https://${envDomain}`,
      sesVerified: true,
      sesStatus: "Already sending (environment sender)",
    },
    {
      key: "klymb",
      name: "Klymb",
      domain: "klymb.ai",
      fromName: "Klymb",
      fromAddresses: ["team@klymb.ai", "no-reply@klymb.ai"],
      replyTo: "team@klymb.ai",
      websiteUrl: "https://klymb.ai",
      sesVerified: false,
      sesStatus: null,
    },
  ];

  const hasDefault = (await db.brand.count({ where: { isDefault: true } })) > 0;
  for (const b of brands) {
    const existing = await db.brand.findUnique({ where: { key: b.key } });
    if (existing) {
      console.log(`brand ${b.key}: exists, left as is`);
      continue;
    }
    const isDefault = !hasDefault && b.key === "abtalks";
    console.log(`brand ${b.key}: create (${b.domain}, ${b.fromAddresses.join(", ")}${isDefault ? ", default" : ""})`);
    if (apply) await db.brand.create({ data: { ...b, isDefault, sesCheckedAt: b.sesVerified ? new Date() : null } });
  }

  const where = { brandKey: "", reason: { in: [SuppressionReason.UNSUBSCRIBE, SuppressionReason.COMPLAINT] } };
  const count = await db.suppression.count({ where });
  console.log(`suppressions: ${count} unsubscribe/complaint rows → brand "abtalks"`);
  if (apply && count > 0) {
    const res = await db.suppression.updateMany({ where, data: { brandKey: "abtalks" } });
    console.log(`  updated ${res.count}`);
  }

  if (!apply) console.log("\nDry run — nothing changed. Re-run with --apply.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
