"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Card, Input, Label, Select, Button } from "@/components/ui";
import { saveMarketingTemplate, sendMarketingTestEmail, MARKETING_TEMPLATE_CATEGORIES } from "./actions";

// Unlayer must load client-side only; it renders an <iframe> that needs `window`.
const EmailEditor = dynamic(() => import("react-email-editor"), { ssr: false }) as unknown as React.ComponentType<{
  ref?: React.Ref<{ editor: unknown } | null>;
  minHeight?: string | number;
  onReady?: () => void;
  options?: Record<string, unknown>;
}>;

// The library exposes editor methods via ref.editor.
type UnlayerEditor = {
  loadDesign: (design: unknown) => void;
  saveDesign: (cb: (design: unknown) => void) => void;
  exportHtml: (cb: (data: { design: unknown; html: string }) => void) => void;
  addEventListener?: (event: string, cb: () => void) => void;
};
type UnlayerRef = { editor: UnlayerEditor } | null;

export function MarketingTemplateEditor({
  templateId,
  initial,
}: {
  templateId?: string;
  initial?: {
    name?: string;
    category?: string;
    subject?: string;
    previewText?: string | null;
    designJson?: unknown;
  };
}) {
  const ref = useRef<UnlayerRef>(null);
  const [ready, setReady] = useState(false);
  const [pending, start] = useTransition();
  const [pendingTest, startTest] = useTransition();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!ready || !ref.current) return;
    if (initial?.designJson) {
      try {
        ref.current.editor.loadDesign(initial.designJson);
      } catch {
        /* ignore — new templates start with the default design */
      }
    }
  }, [ready, initial?.designJson]);

  const submit = () => {
    if (!ref.current) return;
    ref.current.editor.exportHtml(({ design, html }) => {
      const form = document.getElementById("template-form") as HTMLFormElement | null;
      if (!form) return;
      (form.elements.namedItem("designJson") as HTMLInputElement).value = JSON.stringify(design);
      (form.elements.namedItem("html") as HTMLInputElement).value = html;
      start(() => {
        form.requestSubmit();
      });
    });
  };

  const sendTest = () => {
    if (!templateId || !testTo) {
      setTestResult("Save the template first, then enter an address.");
      return;
    }
    startTest(async () => {
      const res = await sendMarketingTestEmail(templateId, testTo);
      setTestResult(res.ok ? `Sent · ${res.providerMessageId}` : `Failed · ${res.error}`);
    });
  };

  return (
    <div className="space-y-4">
      <form id="template-form" action={saveMarketingTemplate}>
        {templateId && <input type="hidden" name="id" value={templateId} />}
        <input type="hidden" name="designJson" defaultValue="" />
        <input type="hidden" name="html" defaultValue="" />

        <Card className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" name="category" defaultValue={initial?.category ?? "Custom"}>
                {MARKETING_TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="previewText">Preview text (optional)</Label>
              <Input id="previewText" name="previewText" defaultValue={initial?.previewText ?? ""} />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                required
                placeholder="Registrations open for {{event_name}}"
                defaultValue={initial?.subject ?? ""}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use <code>{"{{first_name}}"}</code>-style tokens. Variables are auto-detected on save.
              </p>
            </div>
          </div>
        </Card>
      </form>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Drag blocks from the right panel. Changes save when you click <b>Save template</b> below.
        </div>
        <div className="min-h-[560px]">
          <EmailEditor
            ref={ref}
            minHeight={560}
            onReady={() => setReady(true)}
            options={{
              displayMode: "email",
              features: { textEditor: { fontSizes: [10, 12, 14, 16, 18, 24, 32] } },
            }}
          />
        </div>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="testTo">Send test email</Label>
          <div className="flex gap-2">
            <Input
              id="testTo"
              type="email"
              placeholder="you@abtalks.in"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={pendingTest || !templateId}
              onClick={sendTest}
            >
              {pendingTest ? "Sending…" : "Send test"}
            </Button>
          </div>
          {testResult && <div className="mt-1 text-xs text-muted-foreground">{testResult}</div>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" as="a" href="/marketing/templates">
            Cancel
          </Button>
          <Button type="button" disabled={pending || !ready} onClick={submit}>
            {pending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
