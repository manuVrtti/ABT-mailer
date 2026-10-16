import { DirectSendStatus, EmailJobStatus } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Flip a SENDING personal-mails batch to COMPLETED once no job of it is still
 * in flight. Kept dependency-free so the delivery worker can call it without
 * an import cycle.
 */
export async function completeDirectSendIfDone(directSendId: string): Promise<boolean> {
  const inFlight = await db.emailJob.count({
    where: {
      directSendId,
      status: { in: [EmailJobStatus.PENDING, EmailJobStatus.QUEUED, EmailJobStatus.SENDING] },
    },
  });
  if (inFlight > 0) return false;
  const res = await db.directSend.updateMany({
    where: { id: directSendId, status: DirectSendStatus.SENDING },
    data: { status: DirectSendStatus.COMPLETED, completedAt: new Date() },
  });
  return res.count > 0;
}
