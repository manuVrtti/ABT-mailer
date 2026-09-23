"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Card, Input, Label, Select, Textarea, Button, Badge } from "@/components/ui";
import { saveMarketingTemplate, sendMarketingTestEmail } from "./actions";
import { MARKETING_TEMPLATE_CATEGORIES } from "./categories";

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

type Mode = "visual" | "html";

/** Local mirror of the server-side variable regex so we can preview detected tokens on the client. */
const TOKEN_RE = /\{\{\s*!?\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\s*default:\s*"[^"]*"\s*)?\}\}/g;
function detectVariables(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(TOKEN_RE)) if (m[1]) out.add(m[1]);
  return [...out];
}

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
    html?: string;
  };
}) {
  const ref = useRef<UnlayerRef>(null);
  const [ready, setReady] = useState(false);
  const [pending, start] = useTransition();
  const [pendingTest, startTest] = useTransition();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");

  // Decide the initial mode. A stored design with content → visual mode; anything else → html mode
  // (existing templates that were saved as raw HTML come back with designJson = { mode: "raw" }).
  const initialMode: Mode = useMemo(() => {
    const d = initial?.designJson as { mode?: string } | undefined;
    if (d && typeof d === "object" && d.mode === "raw") return "html";
    if (initial?.designJson) return "visual";
    return "html"; // brand-new templates default to Paste HTML — matches how most senders start.
  }, [initial?.designJson]);
  const [mode, setMode] = useState<Mode>(initialMode);

  const [rawSubject, setRawSubject] = useState(initial?.subject ?? "");
  const [rawHtml, setRawHtml] = useState(initial?.html ?? "");
  const detectedVars = useMemo(() => detectVariables(`${rawSubject}\n${rawHtml}`), [rawSubject, rawHtml]);

  useEffect(() => {
    if (mode !== "visual" || !ready || !ref.current) return;
    if (initial?.designJson && typeof initial.designJson === "object" && !(initial.designJson as { mode?: string }).mode) {
      try {
        ref.current.editor.loadDesign(initial.designJson);
      } catch {
        /* ignore — new templates start with the default design */
      }
    }
  }, [mode, ready, initial?.designJson]);

  const submit = () => {
    const form = document.getElementById("template-form") as HTMLFormElement | null;
    if (!form) return;

    const setField = (name: string, value: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el) el.value = value;
    };

    if (mode === "html") {
      setField("designJson", JSON.stringify({ mode: "raw" }));
      setField("html", rawHtml);
      start(() => form.requestSubmit());
      return;
    }

    if (!ref.current) return;
    ref.current.editor.exportHtml(({ design, html }) => {
      setField("designJson", JSON.stringify(design));
      setField("html", html);
      start(() => form.requestSubmit());
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
        {/* Keep subject in the form so the server action always reads the current value.
            In html mode we mirror our controlled state into it via defaultValue + key. */}
        <input type="hidden" name="_mode" value={mode} />

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
                value={rawSubject}
                onChange={(e) => setRawSubject(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use <code>{"{{first_name}}"}</code>-style tokens. Variables are auto-detected on save.
              </p>
            </div>
          </div>
        </Card>
      </form>

      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex overflow-hidden rounded-md border border-input text-xs">
          {(["visual", "html"] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              className={
                "px-3 py-1.5 " +
                (mode === m ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")
              }
            >
              {m === "visual" ? "Visual editor" : "Paste HTML"}
            </button>
          ))}
        </div>
        {mode === "html" && detectedVars.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Detected variables:
            {detectedVars.map((v) => (
              <Badge key={v} tone="muted">
                {v}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {mode === "visual" ? (
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
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="raw-html-input">Paste your HTML</Label>
              <span className="text-[10px] text-muted-foreground">
                An unsubscribe footer is added automatically at send time.
              </span>
            </div>
            <Textarea
              id="raw-html-input"
              rows={26}
              spellCheck={false}
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder={`<!doctype html>\n<html>\n  <body>\n    <p>Hi {{first_name | default: "there"}},</p>\n    <p>…</p>\n  </body>\n</html>`}
            />
            <p className="text-xs text-muted-foreground">
              Tip: exports from Brevo, Mailchimp, or an MJML compiler paste in cleanly. Absolute
              <code className="mx-1">http(s)</code>
              links are auto-tagged with <code>utm_source=email</code> at send time.
            </p>
          </Card>
          <Card className="p-0">
            <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">Preview</div>
            <iframe
              title="HTML preview"
              srcDoc={rawHtml || "<p style='font-family:sans-serif;color:#999;padding:24px'>Paste HTML on the left to preview it here.</p>"}
              sandbox=""
              className="h-[560px] w-full bg-white"
            />
          </Card>
        </div>
      )}

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
          <Button
            type="button"
            disabled={pending || (mode === "visual" && !ready)}
            onClick={submit}
          >
            {pending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
