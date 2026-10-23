import { Role } from "@prisma/client";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { DEFAULT_PERMISSIONS, MARKETER_ONLY, PERMISSIONS, accessForRole } from "@/server/access/permissions";
import { PermissionsGrid } from "./_grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles & permissions" };

export default async function PermissionsPage() {
  await requireRole([Role.ADMIN]);
  const [marketer, viewer, counts] = await Promise.all([
    accessForRole(Role.MARKETER),
    accessForRole(Role.VIEWER),
    db.user.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
  ]);
  const people = (r: Role) => counts.find((c) => c.role === r)?._count._all ?? 0;

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        icon={ShieldCheck}
        description="Tick the sections each role can open. Unticked sections disappear from their sidebar, dashboard and search. Marketers can create, edit and send in their sections; viewers only look. Which brands each person sees is set per person in Users & roles."
      />
      <PermissionsGrid
        permissions={PERMISSIONS.map((p) => ({ key: p.key, label: p.label, hint: p.hint }))}
        initial={{ MARKETER: Array.from(marketer), VIEWER: Array.from(viewer) }}
        defaults={DEFAULT_PERMISSIONS}
        marketerOnly={MARKETER_ONLY}
        people={{ ADMIN: people(Role.ADMIN), MARKETER: people(Role.MARKETER), VIEWER: people(Role.VIEWER) }}
      />
    </div>
  );
}
