import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { canSeeKlymb, contactListWhere, currentScope, fromEmailWhere, templateWhere } from "@/server/access/scope";
import { AppShell, type NavCounts } from "@/components/app-shell";
import { currentAccess, currentPermissions } from "@/server/access/permissions";

async function getNavCounts(): Promise<NavCounts> {
  const scope = await currentScope();
  const scoped = fromEmailWhere(scope);
  const [
    campaigns,
    campaignsSending,
    contacts,
    lists,
    segments,
    templates,
    transactionalTemplates,
    eventRules,
    deliveryLogs,
  ] = await Promise.all([
    db.campaign.count({ where: scoped }),
    db.campaign.count({
      where: {
        AND: [scoped, { status: { in: [CampaignStatus.SENDING, CampaignStatus.SCHEDULED, CampaignStatus.QUEUED] } }],
      },
    }),
    db.marketingContact.count(),
    db.contactList.count({ where: contactListWhere(scope) }),
    db.segment.count(),
    db.emailTemplate.count({ where: templateWhere(scope) }),
    db.transactionalTemplate.count({ where: { isActive: true } }),
    db.emailEventRule.count({ where: { isActive: true } }),
    db.emailJob.count({ where: scoped }),
  ]);
  return {
    campaigns,
    campaignsSending,
    contacts,
    lists,
    segments,
    templates,
    transactionalTemplates,
    eventRules,
    deliveryLogs,
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, counts, permissions, access, scope] = await Promise.all([
    requireUser(),
    getNavCounts(),
    currentPermissions(),
    currentAccess(),
    currentScope(),
  ]);
  return (
    <AppShell
      user={user}
      counts={counts}
      permissions={Array.from(permissions)}
      access={Array.from(access)}
      klymb={canSeeKlymb(scope)}
    >
      {children}
    </AppShell>
  );
}
