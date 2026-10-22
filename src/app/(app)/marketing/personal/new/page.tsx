import { Send } from "lucide-react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { sendableDefault } from "@/server/brands";
import { currentScope, sendableSenders } from "@/server/access/scope";
import { NewDirectSendForm } from "./_new-form";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "New personal mails" };

export default async function NewDirectSendPage() {
  await requireRole([Role.ADMIN, Role.MARKETER]);
  // Only the brands this person may send as (all, for admins).
  const scope = await currentScope();
  const senders = sendableSenders(scope);
  const def = scope.all ? sendableDefault(scope.brands) : scope.brands.find((b) => b.sesVerified);
  return (
    <div>
      <PageHeader
        title="New personal mails"
        icon={Send}
        description="Upload a CSV where every row is one email: who it goes to, its subject, its body and (optionally) its attachments."
      />
      <NewDirectSendForm senders={senders} defaultSender={def?.fromAddresses[0] ?? senders[0]?.email ?? ""} />
    </div>
  );
}
