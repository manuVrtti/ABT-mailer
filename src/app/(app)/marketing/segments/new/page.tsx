import { PageHeader } from "@/components/ui";
import { SegmentBuilder } from "../_builder";
import { requirePermission } from "@/server/access/permissions";

export const metadata = { title: "New segment" };

export default async function NewSegmentPage() {
  await requirePermission("contacts.manage");
  return (
    <div>
      <PageHeader title="New segment" description="Build a reusable audience. Preview counts before saving." />
      <SegmentBuilder />
    </div>
  );
}
