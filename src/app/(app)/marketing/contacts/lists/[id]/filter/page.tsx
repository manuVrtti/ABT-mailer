import { notFound, redirect } from "next/navigation";
import { ContactListKind, Role } from "@prisma/client";
import { DatabaseZap } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { defaultKlymbFilter, klymbFilterSchema } from "@/server/klymb/filter";
import { ContactsTabs } from "../../../_tabs";
import { KlymbListForm } from "../../klymb/_klymb-form";
import { KlymbUnavailable, loadOptionsOrError } from "../../klymb/_options";
import { requirePermission } from "@/server/access/permissions";
import { canSeeKlymb, currentScope } from "@/server/access/scope";

export const dynamic = "force-dynamic";
// Saving refreshes the list from Klymb.
export const maxDuration = 120;
export const metadata = { title: "Edit Klymb list" };

export default async function EditKlymbFilterPage({ params }: { params: { id: string } }) {
  await requirePermission("contacts.manage");
  if (!canSeeKlymb(await currentScope())) notFound();
  const list = await db.contactList.findUnique({ where: { id: params.id } });
  if (!list) notFound();
  if (list.kind !== ContactListKind.KLYMB) redirect(`/marketing/contacts/lists/${list.id}`);

  const parsed = klymbFilterSchema.safeParse(list.klymbFilter);
  const res = await loadOptionsOrError();
  return (
    <div>
      <ContactsTabs />
      <PageHeader title={`Edit “${list.name}”`} icon={DatabaseZap} description="Change who this live list includes. Saving refreshes it from Klymb straight away." />
      {res.ok ? (
        <KlymbListForm
          options={res.options}
          initialFilter={parsed.success ? parsed.data : defaultKlymbFilter()}
          list={{ id: list.id, name: list.name, description: list.description, color: list.color }}
        />
      ) : (
        <KlymbUnavailable error={res.error} />
      )}
    </div>
  );
}
