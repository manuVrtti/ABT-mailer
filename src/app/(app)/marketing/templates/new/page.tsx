import { PageHeader } from "@/components/ui";
import { MarketingTemplateEditor } from "../_editor";

export const metadata = { title: "New marketing template" };

export default function NewMarketingTemplatePage() {
  return (
    <div>
      <PageHeader title="New marketing template" description="Design a reusable campaign email." />
      <MarketingTemplateEditor />
    </div>
  );
}
