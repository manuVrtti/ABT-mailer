import { Receiver } from "@upstash/qstash";
import { getServerEnv } from "@/lib/env";

/**
 * Verify a QStash callback's signature. Every worker endpoint must call this
 * before doing any work. If the request is not signed by our known keys, we
 * reject it — no logging of body content until the signature checks out.
 */
export async function verifyQStashSignature(req: Request, rawBody: string): Promise<boolean> {
  const env = getServerEnv();
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
    // Refuse when unconfigured — better to 500 than to accept unsigned callbacks.
    return false;
  }
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;
  try {
    await receiver.verify({ signature, body: rawBody });
    return true;
  } catch {
    return false;
  }
}
