"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Card, Label, Textarea, Button } from "@/components/ui";
import { addMembersByEmail } from "../actions";

export function AddMembersPanel({ listId }: { listId: string }) {
  const [emails, setEmails] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-medium">Add contacts to this list</div>
          <div className="text-[11px] text-muted-foreground">
            Paste one or more emails, separated by commas, spaces, or new lines. Only existing contacts are added.
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="emails">Emails</Label>
        <Textarea
          id="emails"
          rows={4}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"alice@example.com\nbob@example.com, carol@example.com"}
        />
      </div>
      <div className="flex items-center justify-between">
        {result ? <div className="text-xs text-muted-foreground">{result}</div> : <div />}
        <Button
          type="button"
          disabled={pending || !emails.trim()}
          onClick={() =>
            start(async () => {
              const res = await addMembersByEmail(listId, emails);
              setResult(`Added ${res.added} contact${res.added === 1 ? "" : "s"}${res.notFound > 0 ? ` · ${res.notFound} not found` : ""}.`);
              if (res.added > 0) setEmails("");
            })
          }
        >
          {pending ? "Adding…" : "Add to list"}
        </Button>
      </div>
    </Card>
  );
}
