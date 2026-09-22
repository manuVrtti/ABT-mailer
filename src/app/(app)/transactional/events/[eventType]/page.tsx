import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { RuleForm } from "../_rule-form";

export const dynamic = "force-dynamic";

export default async function EditEventRulePage({ params }: { params: { eventType: string } }) {
  const eventType = decodeURIComponent(params.eventType);
  const rule = await db.emailEventRule.findUnique({ where: { eventType } });
  if (!rule) notFound();

  const templates = await db.transactionalTemplate.findMany({
    where: { isActive: true },
    orderBy: { templateKey: "asc" },
    select: { templateKey: true, name: true },
  });

  return (
    <div>
      <PageHeader title={`Rule · ${eventType}`} description="Update the template mapping or required variables." />
      <RuleForm
        templates={templates}
        initial={{
          eventType: rule.eventType,
          templateKey: rule.templateKey,
          description: rule.description,
          requiredVars: rule.requiredVars,
          isActive: rule.isActive,
        }}
      />
    </div>
  );
}
