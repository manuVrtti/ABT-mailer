import { notFound, redirect } from "next/navigation";
import { DirectSendStatus } from "@prisma/client";
import { Mail } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { sendableDefault } from "@/server/brands";
import { canSendAs, currentScope, sendableSenders } from "@/server/access/scope";
import { requirePermission } from "@/server/access/permissions";
import { SingleMailForm } from "./_single-form";

export const dynamic = "force-dynamic";
// Sending creates and queues the job right away.
export const maxDuration = 60;
export const metadata = { title: "Single email" };

export default async function SingleMailPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await requirePermission("personal.manage");
  // Only the brands this person may send as (all, for admins).
  const scope = await currentScope();
  const senders = sendableSenders(scope);
  const def = scope.all ? sendableDefault(scope.brands) : scope.brands.find((b) => b.sesVerified);

  // Editing a saved draft.
  let draft: React.ComponentProps<typeof SingleMailForm>["draft"] = null;
  if (searchParams.id) {
    const send = await db.directSend.findUnique({
      where: { id: searchParams.id },
      include: {
        rows: { where: { rowNumber: 1 }, take: 1 },
        attachments: { select: { id: true, filename: true, size: true }, orderBy: { filename: "asc" } },
      },
    });
    if (!send || !send.single || !canSendAs(scope, send.fromEmail)) notFound();
    if (send.status !== DirectSendStatus.DRAFT) redirect(`/marketing/customize/${send.id}`);
    draft = {
      id: send.id,
      fromEmail: send.fromEmail,
      to: send.toEmails,
      cc: send.ccEmails,
      bcc: send.bccEmails,
      subject: send.rows[0]?.subject ?? "",
      body: send.rows[0]?.body ?? "",
      attachments: send.attachments,
    };
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={draft ? "Edit single email" : "Single email"}
        icon={Mail}
        description="Write one email to anyone — Gmail, Outlook or any address — with CC, BCC and attachments."
      />
      <SingleMailForm
        senders={senders}
        defaultSender={def?.fromAddresses[0] ?? senders[0]?.email ?? ""}
        me={user.email ?? ""}
        draft={draft}
      />
    </div>
  );
}
