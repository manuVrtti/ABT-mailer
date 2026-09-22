import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { RuleForm } from "../_rule-form";

export const metadata = { title: "New event rule" };
export const dynamic = "force-dynamic";

export default async function NewEventRulePage() {
  const templates = await db.transactionalTemplate.findMany({
    where: { isActive: true },
    orderBy: { templateKey: "asc" },
    select: { templateKey: true, name: true },
  });
  return (
    <div>
      <PageHeader title="New event rule" description="Map an ABTalks event to a transactional template." />
      <RuleForm templates={templates} />
    </div>
  );
}
