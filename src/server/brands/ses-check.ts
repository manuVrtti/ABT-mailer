import { GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { getServerEnv } from "@/lib/env";

export type DomainCheck = {
  /** SES will send from this domain: identity verified and DKIM signing on. */
  ok: boolean;
  /** One line for the Senders page, e.g. "Verified · DKIM SUCCESS · MAIL FROM SUCCESS". */
  status: string;
};

/**
 * Ask SES whether `domain` can be sent from. Needs ses:GetEmailIdentity on the
 * mailer's IAM user (see docs/infra/iam-policy.json).
 */
export async function checkDomainInSes(domain: string): Promise<DomainCheck> {
  const env = getServerEnv();
  const client = new SESv2Client({
    region: env.AWS_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        : undefined,
  });
  try {
    const res = await client.send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    const dkim = res.DkimAttributes?.Status ?? "NOT_STARTED";
    const mailFrom = res.MailFromAttributes?.MailFromDomainStatus;
    const ok = Boolean(res.VerifiedForSendingStatus) && dkim === "SUCCESS";
    const parts = [
      res.VerifiedForSendingStatus ? "Verified for sending" : "Not verified yet",
      `DKIM ${dkim}`,
      mailFrom ? `MAIL FROM ${mailFrom}` : "no custom MAIL FROM",
    ];
    return { ok, status: parts.join(" · ") };
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "NotFoundException") {
      return { ok: false, status: `${domain} is not added in SES (${env.AWS_REGION}) yet` };
    }
    if (name === "AccessDeniedException") {
      return { ok: false, status: "The mailer's AWS user may not call ses:GetEmailIdentity — add it to the IAM policy" };
    }
    return { ok: false, status: `SES check failed: ${(err as Error).message.slice(0, 160)}` };
  }
}
