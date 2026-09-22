import { Card, Input, Label, Select, Textarea, Button } from "@/components/ui";
import { saveTransactionalTemplate } from "../actions";

export function TemplateForm({
  initial,
}: {
  initial?: {
    templateKey?: string;
    name?: string;
    subject?: string;
    html?: string;
    text?: string | null;
    category?: "TRANSACTIONAL_NONESSENTIAL" | "TRANSACTIONAL_ESSENTIAL";
  };
}) {
  const isEdit = !!initial?.templateKey;
  return (
    <form action={saveTransactionalTemplate} className="space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="templateKey">Template key</Label>
            <Input
              id="templateKey"
              name="templateKey"
              required
              placeholder="welcome_email"
              defaultValue={initial?.templateKey ?? ""}
              readOnly={isEdit}
              pattern="^[a-z][a-z0-9_]*$"
              title="lowercase snake_case"
            />
          </div>
          <div>
            <Label htmlFor="name">Display name</Label>
            <Input id="name" name="name" required placeholder="Welcome Email" defaultValue={initial?.name ?? ""} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              required
              placeholder='Welcome to ABTalks, {{first_name}}'
              defaultValue={initial?.subject ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={initial?.category ?? "TRANSACTIONAL_NONESSENTIAL"}>
              <option value="TRANSACTIONAL_NONESSENTIAL">Non-essential (respects marketing unsubscribe)</option>
              <option value="TRANSACTIONAL_ESSENTIAL">Essential (password reset / security)</option>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="activate" name="activate" type="checkbox" defaultChecked className="h-4 w-4" />
            <Label htmlFor="activate">Activate this version</Label>
          </div>
        </div>

        <div>
          <Label htmlFor="html">HTML</Label>
          <Textarea id="html" name="html" rows={14} required defaultValue={initial?.html ?? ""} />
          <p className="mt-1 text-xs text-muted-foreground">
            Use <code>{"{{variable}}"}</code> and <code>{'{{variable | default: "fallback"}}'}</code> for personalization.
          </p>
        </div>
        <div>
          <Label htmlFor="text">Plain-text alternative (optional but recommended)</Label>
          <Textarea id="text" name="text" rows={6} defaultValue={initial?.text ?? ""} />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" as="a" href="/transactional/templates">
          Cancel
        </Button>
        <Button type="submit">Save version</Button>
      </div>
    </form>
  );
}
