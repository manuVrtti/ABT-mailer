import { PageHeader } from "@/components/ui";
import { TemplateForm } from "../_template-form";
import { requirePermission } from "@/server/access/permissions";

export const metadata = { title: "New transactional template" };

export default async function NewTransactionalTemplatePage() {
  await requirePermission("transactional.manage");
  return (
    <div>
      <PageHeader title="New transactional template" description="Create a versioned transactional email template." />
      <TemplateForm />
    </div>
  );
}
