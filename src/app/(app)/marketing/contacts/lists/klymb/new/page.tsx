import { DatabaseZap } from "lucide-react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { defaultKlymbFilter } from "@/server/klymb/filter";
import { ContactsTabs } from "../../../_tabs";
import { KlymbListForm } from "../_klymb-form";
import { KlymbUnavailable, loadOptionsOrError } from "../_options";
import { requirePermission } from "@/server/access/permissions";

export const dynamic = "force-dynamic";
// Creating the list also loads everyone it matches from Klymb.
export const maxDuration = 120;
export const metadata = { title: "New Klymb list" };

export default async function NewKlymbListPage() {
  await requirePermission("contacts.manage");
  const res = await loadOptionsOrError();
  return (
    <div>
      <ContactsTabs />
      <PageHeader
        title="New Klymb list"
        icon={DatabaseZap}
        description="A live list built from the Klymb database. It refreshes automatically every time a campaign is sent to it — no Excel exports."
      />
      {res.ok ? <KlymbListForm options={res.options} initialFilter={defaultKlymbFilter()} /> : <KlymbUnavailable error={res.error} />}
    </div>
  );
}
