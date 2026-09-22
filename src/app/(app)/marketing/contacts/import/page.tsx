import { PageHeader, Card, Button, Label } from "@/components/ui";
import { startCsvImport } from "../actions";

export const metadata = { title: "Import contacts" };

export default function ImportContactsPage() {
  return (
    <div>
      <PageHeader
        title="Import contacts"
        description="Upload a CSV. Columns are auto-detected — the more the file uses standard names (email, first_name, college, branch, year, graduation_year), the less mapping you'll need."
      />
      <form action={startCsvImport} encType="multipart/form-data" className="space-y-4">
        <Card className="space-y-4">
          <div>
            <Label htmlFor="file">CSV file</Label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-accent"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Max 20 MB. Any columns beyond the standard set are preserved in the contact&apos;s metadata.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            <b>Standard columns:</b> email (required), first_name, last_name, phone, college, branch, year,
            graduation_year, registration_status. Emails are lowercased and duplicates deduped automatically.
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button as="a" variant="secondary" href="/marketing/contacts">
            Cancel
          </Button>
          <Button type="submit">Start import</Button>
        </div>
      </form>
    </div>
  );
}
