import { PageHeader } from "@/components/ui";
import { MarketingTemplateEditor } from "../_editor";
import { currentScope } from "@/server/access/scope";

export const metadata = { title: "New marketing template" };

export default async function NewMarketingTemplatePage() {
  const scope = await currentScope();
  return (
    <div>
      <PageHeader title="New marketing template" description="Design a reusable campaign email." />
      <MarketingTemplateEditor brands={scope.brands.map((b) => ({ key: b.key, name: b.name }))} canShare={scope.all} />
    </div>
  );
}
