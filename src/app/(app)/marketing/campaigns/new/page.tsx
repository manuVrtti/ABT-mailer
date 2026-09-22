import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { PageHeader, Card, Input, Label, Select, Button } from "@/components/ui";
import { createCampaign } from "../actions";
import Link from "next/link";

export const metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const env = getServerEnv();
  const [templates, segments] = await Promise.all([
    db.emailTemplate.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, category: true } }),
    db.segment.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, audienceSize: true } }),
  ]);

  return (
    <div>
      <PageHeader title="New campaign" description="Pick an audience, a template, and the sender details. You can send a test before launching." />
      {templates.length === 0 || segments.length === 0 ? (
        <Card>
          <div className="text-sm">You need at least one template and one segment before creating a campaign.</div>
          <div className="mt-3 flex gap-3 text-sm">
            {templates.length === 0 && (
              <Link href="/marketing/templates/new" className="underline underline-offset-4">
                Create a template
              </Link>
            )}
            {segments.length === 0 && (
              <Link href="/marketing/segments/new" className="underline underline-offset-4">
                Create a segment
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <form action={createCampaign} className="space-y-4">
          <Card className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Campaign name</Label>
                <Input id="name" name="name" required placeholder="Freshers Registration Drive" />
              </div>
              <div>
                <Label htmlFor="segmentId">Audience segment</Label>
                <Select id="segmentId" name="segmentId" required>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.audienceSize != null ? `(~${s.audienceSize.toLocaleString()})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="templateId">Template</Label>
                <Select id="templateId" name="templateId" required>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.category}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" name="subject" required placeholder="Registrations open for {{event_name}}" />
              </div>
              <div>
                <Label htmlFor="previewText">Preview text</Label>
                <Input id="previewText" name="previewText" placeholder="Shown next to subject in inbox lists." />
              </div>
              <div>
                <Label htmlFor="fromName">From name</Label>
                <Input id="fromName" name="fromName" defaultValue={env.SES_FROM_NAME} required />
              </div>
              <div>
                <Label htmlFor="fromEmail">From email</Label>
                <Input id="fromEmail" name="fromEmail" type="email" defaultValue={env.SES_FROM_EMAIL} required />
              </div>
              <div>
                <Label htmlFor="replyTo">Reply-to (optional)</Label>
                <Input id="replyTo" name="replyTo" type="email" defaultValue={env.SES_REPLY_TO ?? ""} />
              </div>
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <Button as="a" href="/marketing/campaigns" variant="secondary">
              Cancel
            </Button>
            <Button type="submit">Create draft</Button>
          </div>
        </form>
      )}
    </div>
  );
}
