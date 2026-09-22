"use client";
import { useState, useTransition } from "react";
import { Card, Input, Label, Textarea, Button } from "@/components/ui";
import { sendTestTransactional } from "../../actions";

export function TestSendPanel({ templateKey, declaredVars }: { templateKey: string; declaredVars: string[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const initialVars = JSON.stringify(
    Object.fromEntries(declaredVars.map((v) => [v, `example_${v}`])),
    null,
    2,
  );

  return (
    <Card>
      <form
        action={(fd) =>
          start(async () => {
            fd.set("templateKey", templateKey);
            const res = await sendTestTransactional(fd);
            setResult(res.ok ? `Sent · ${res.providerMessageId}` : `Failed · ${res.error}`);
          })
        }
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="to">Send test to</Label>
            <Input id="to" name="to" type="email" required placeholder="you@abtalks.in" />
          </div>
          <div className="pt-6 text-xs text-muted-foreground">
            Test sends are not logged in analytics and bypass the queue.
          </div>
        </div>
        <div>
          <Label htmlFor="variables">Variables (JSON)</Label>
          <Textarea id="variables" name="variables" rows={6} defaultValue={initialVars} />
        </div>
        <div className="flex items-center justify-between">
          {result ? <span className="text-xs text-muted-foreground">{result}</span> : <span />}
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send test"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
