/**
 * SES smoke test. Run with:
 *   npx tsx scripts/verify-ses.ts
 *
 * Checks:
 *   1. AWS credentials work (list identities).
 *   2. The configured sending identity is verified and DKIM is Success.
 *   3. The configuration set exists.
 *   4. Send quota is out of sandbox (>200/day sent max).
 *
 * Exits 0 on all-green; non-zero on any failure. Prints a short report.
 */
import {
  SESv2Client,
  GetEmailIdentityCommand,
  GetConfigurationSetCommand,
  GetAccountCommand,
} from "@aws-sdk/client-sesv2";

const region = process.env.AWS_REGION ?? "ap-south-1";
const identity = process.env.SES_IDENTITY ?? "mail.abtalks.in";
const configurationSet = process.env.SES_CONFIGURATION_SET ?? "abtalks-mailer";

async function main() {
  const client = new SESv2Client({ region });

  const issues: string[] = [];

  // 1 + 2. Identity + DKIM
  try {
    const id = await client.send(new GetEmailIdentityCommand({ EmailIdentity: identity }));
    if (!id.VerifiedForSendingStatus) issues.push(`Identity ${identity} is not verified for sending`);
    const dkim = id.DkimAttributes?.Status;
    if (dkim !== "SUCCESS") issues.push(`DKIM status for ${identity} is ${dkim ?? "unknown"} (need SUCCESS)`);
  } catch (err) {
    issues.push(`GetEmailIdentity ${identity} failed: ${(err as Error).message}`);
  }

  // 3. Configuration set
  try {
    await client.send(new GetConfigurationSetCommand({ ConfigurationSetName: configurationSet }));
  } catch (err) {
    issues.push(`GetConfigurationSet ${configurationSet} failed: ${(err as Error).message}`);
  }

  // 4. Account status / sandbox
  try {
    const acct = await client.send(new GetAccountCommand({}));
    if (acct.ProductionAccessEnabled !== true) issues.push("Account is still in the SES sandbox");
    if (acct.SendingEnabled === false) issues.push("Sending is DISABLED for this account");
    console.warn(
      `SES account: production=${acct.ProductionAccessEnabled} sending=${acct.SendingEnabled} ` +
        `max24h=${acct.SendQuota?.Max24HourSend} maxSend/s=${acct.SendQuota?.MaxSendRate}`,
    );
  } catch (err) {
    issues.push(`GetAccount failed: ${(err as Error).message}`);
  }

  if (issues.length > 0) {
    console.error("SES verification FAILED:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.warn(`SES verification OK for region=${region}, identity=${identity}, set=${configurationSet}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
