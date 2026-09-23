import { CampaignStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { AppShell, type NavCounts } from "@/components/app-shell";

async function getNavCounts(): Promise<NavCounts> {
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
    db.campaign.count(),
    db.campaign.count({
      where: {
        status: { in: [CampaignStatus.SENDING, CampaignStatus.SCHEDULED, CampaignStatus.QUEUED] },
      },
    }),
    db.marketingContact.count(),
    db.contactList.count(),
    db.segment.count(),
    db.emailTemplate.count(),
    db.transactionalTemplate.count({ where: { isActive: true } }),
    db.emailEventRule.count({ where: { isActive: true } }),
    db.emailJob.count(),
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
  const [user, counts] = await Promise.all([requireUser(), getNavCounts()]);
  return (
    <AppShell user={user} counts={counts}>
      {children}
    </AppShell>
  );
}
