import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MarketingTemplateEditor } from "../_editor";

export const dynamic = "force-dynamic";

export default async function MarketingTemplateDetail({ params }: { params: { id: string } }) {
  const template = await db.emailTemplate.findUnique({ where: { id: params.id } });
  if (!template) notFound();

  return (
    <div>
      <PageHeader title={template.name} description={`Category: ${template.category}`} />
      <MarketingTemplateEditor
        templateId={template.id}
        initial={{
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
