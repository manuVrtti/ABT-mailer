/* eslint-disable no-console -- CLI script: printing is its output */
/**
 * One-time setup for multi-brand sending. Run after `prisma db push` has added
 * the brands table and suppressions.brand_key:
 *
 *   npx tsx --env-file=.env scripts/setup-brands.ts            # dry run, prints what it would do
 *   npx tsx --env-file=.env scripts/setup-brands.ts --apply    # does it
 *
 * Idempotent. It:
 *   1. creates the ABTalks brand (abtalks.in — already sending, so marked
 *      verified) and makes it the default if no default exists;
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
  // The addresses production actually sends from (email_jobs, Oct 2026):
  // campaigns from no-reply@abtalks.in, the website from team@abtalks.in.
  // Not read from env: a stale local SES_FROM_EMAIL would set the wrong domain
  // and every ABTalks send would then be refused as unverified.
  const brands = [
    {
      key: "abtalks",
      name: "ABTalks",
      domain: "abtalks.in",
      fromName: "ABTalks",
      fromAddresses: ["no-reply@abtalks.in", "team@abtalks.in"],
      replyTo: "team@abtalks.in",
      websiteUrl: "https://abtalks.in",
      sesVerified: true,
      sesStatus: "Already sending",
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
