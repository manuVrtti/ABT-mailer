import { PageHeader } from "@/components/ui";
import { SegmentBuilder } from "../_builder";

export const metadata = { title: "New segment" };

export default function NewSegmentPage() {
  return (
    <div>
      <PageHeader title="New segment" description="Build a reusable audience. Preview counts before saving." />
      <SegmentBuilder />
    </div>
  );
}
