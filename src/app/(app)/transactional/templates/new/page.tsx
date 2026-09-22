import { PageHeader } from "@/components/ui";
import { TemplateForm } from "../_template-form";

export const metadata = { title: "New transactional template" };

export default function NewTransactionalTemplatePage() {
  return (
    <div>
      <PageHeader title="New transactional template" description="Create a versioned transactional email template." />
      <TemplateForm />
    </div>
  );
}
