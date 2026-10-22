import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MarketingTemplateEditor } from "../_editor";
import { canEditTemplate, canUseTemplate, currentScope } from "@/server/access/scope";

export const dynamic = "force-dynamic";

export default async function MarketingTemplateDetail({ params }: { params: { id: string } }) {
  const template = await db.emailTemplate.findUnique({ where: { id: params.id } });
  const scope = await currentScope();
  if (!template || !canUseTemplate(scope, template)) notFound();
  const editable = canEditTemplate(scope, template);

  return (
    <div>
      <PageHeader title={template.name} description={`Category: ${template.category}`} />
      {!editable && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          This is a <b>shared</b> template used by every brand, so only admins can change it. You can still use it in
          campaigns, or duplicate it to make your own copy.
        </div>
      )}
      <MarketingTemplateEditor
        templateId={template.id}
        brands={scope.brands.map((b) => ({ key: b.key, name: b.name }))}
        canShare={scope.all}
        initial={{
          brandKey: template.brandKey,
          name: template.name,
          category: template.category,
          subject: template.subject,
          previewText: template.previewText,
          designJson: template.designJson,
          html: template.html,
        }}
      />
    </div>
  );
}
