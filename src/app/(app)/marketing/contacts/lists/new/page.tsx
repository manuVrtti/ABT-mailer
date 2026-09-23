import { ListChecks } from "lucide-react";
import { PageHeader, Card, Input, Label, Textarea, Button } from "@/components/ui";
import { ContactsTabs } from "../../_tabs";
import { createList } from "../actions";
import { CONTACT_LIST_COLORS } from "../_constants";
import { ColorPicker } from "./_color-picker";

export const metadata = { title: "New contact list" };

export default function NewContactListPage() {
  return (
    <div>
      <ContactsTabs />
      <PageHeader
        title="New contact list"
        icon={ListChecks}
        description="Named bucket of contacts — think 'Candidates', 'Recruiters', or 'Hackathon Participants'. A contact can belong to many lists."
      />

      <form action={createList} className="space-y-4">
        <Card className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={120} placeholder="Hackathon participants — Sept 2026" />
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={3} maxLength={500} placeholder="Everyone who signed up for the September hackathon" />
          </div>
          <div>
            <Label>Color</Label>
            <ColorPicker options={[...CONTACT_LIST_COLORS]} />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button as="a" variant="secondary" href="/marketing/contacts/lists">
            Cancel
          </Button>
          <Button type="submit">Create list</Button>
        </div>
      </form>
    </div>
  );
}
