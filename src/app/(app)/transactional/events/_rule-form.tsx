import { Card, Input, Label, Select, Button } from "@/components/ui";
import { saveEventRule } from "../actions";

export function RuleForm({
  templates,
  initial,
}: {
  templates: Array<{ templateKey: string; name: string }>;
  initial?: {
    eventType?: string;
    templateKey?: string;
    description?: string | null;
    requiredVars?: string[];
    isActive?: boolean;
  };
}) {
  const isEdit = !!initial?.eventType;
  return (
    <form action={saveEventRule} className="space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="eventType">Event type</Label>
            <Input
              id="eventType"
              name="eventType"
              required
              placeholder="USER_REGISTERED"
              defaultValue={initial?.eventType ?? ""}
              readOnly={isEdit}
              pattern="^[A-Z][A-Z0-9_]*$"
              title="UPPER_SNAKE_CASE"
            />
          </div>
          <div>
            <Label htmlFor="templateKey">Template</Label>
            <Select id="templateKey" name="templateKey" required defaultValue={initial?.templateKey ?? ""}>
              <option value="">Select a template…</option>
              {templates.map((t) => (
                <option key={t.templateKey} value={t.templateKey}>
                  {t.templateKey} — {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" defaultValue={initial?.description ?? ""} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="requiredVars">Required variables (comma-separated)</Label>
            <Input
              id="requiredVars"
              name="requiredVars"
              placeholder="first_name, event_name"
              defaultValue={(initial?.requiredVars ?? []).join(", ")}
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input id="isActive" name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} className="h-4 w-4" />
            <Label htmlFor="isActive">Rule is active</Label>
          </div>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" as="a" href="/transactional/events">
          Cancel
        </Button>
        <Button type="submit">Save rule</Button>
      </div>
    </form>
  );
}
