import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SegmentBuilder } from "../_builder";
import { ruleTreeSchema } from "@/server/segments/schema";

export const dynamic = "force-dynamic";

export default async function SegmentDetailPage({ params }: { params: { id: string } }) {
  const segment = await db.segment.findUnique({ where: { id: params.id } });
  if (!segment) notFound();

  const rules = ruleTreeSchema.safeParse(segment.rules);

  return (
    <div>
      <PageHeader
        title={segment.name}
        description={segment.description ?? "Update conditions, re-preview, and save."}
      />
      <SegmentBuilder
        segmentId={segment.id}
        initial={rules.success ? rules.data : undefined}
        initialName={segment.name}
        initialDescription={segment.description ?? undefined}
      />
    </div>
  );
}
