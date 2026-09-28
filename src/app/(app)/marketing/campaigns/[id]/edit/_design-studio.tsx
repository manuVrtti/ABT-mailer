"use client";

import { useDeferredValue, useRef, useState } from "react";
import { Code2, LayoutTemplate, Monitor, Search, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { MARKETING_TEMPLATE_CATEGORIES } from "../../../templates/categories";

type TemplateOption = {
  id: string;
  name: string;
  category: string;
  previewText: string | null;
  updated: string;
  html: string;
};

type Tab = "templates" | "html";
type Device = "desktop" | "mobile";

/**
 * Design section: choose a library template (with live preview), or paste HTML
 * for this campaign with a side-by-side preview and an optional
 * "Save as template". Posts to updateCampaignDesign via the parent <form>.
 */
export function DesignStudio({
  campaignId,
  templates,
  selectedTemplateId,
  initialHtml,
}: {
  campaignId: string;
  templates: TemplateOption[];
  selectedTemplateId: string | null;
  initialHtml: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialHtml || templates.length === 0 ? "html" : "templates");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(selectedTemplateId ?? templates[0]?.id ?? null);
  const [html, setHtml] = useState(initialHtml ?? "");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const fileRef = useRef<HTMLInputElement>(null);
  const deferredHtml = useDeferredValue(html);

  const q = query.trim().toLowerCase();
  const matches = (t: TemplateOption) =>
    !q || [t.name, t.category, t.previewText ?? ""].some((s) => s.toLowerCase().includes(q));
  const visible = templates.filter(matches).length;
  const pickedTemplate = templates.find((t) => t.id === picked) ?? null;

  function editAsHtml(t: TemplateOption) {
    setHtml(t.html);
    setTab("html");
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setHtml(await file.text());
  }

  const canSave = tab === "templates" ? Boolean(picked) : html.trim().length > 0;

  return (
    <div className="space-y-4">
      <input type="hidden" name="id" value={campaignId} />
      <input type="hidden" name="mode" value={tab} />
      {tab === "templates" && picked && <input type="hidden" name="templateId" value={picked} />}
      {tab === "html" && <input type="hidden" name="html" value={html} />}

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-border/60 bg-slate-50 p-1 dark:bg-slate-800/50">
        <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<LayoutTemplate className="h-4 w-4" />}>
          Templates
        </TabButton>
        <TabButton active={tab === "html"} onClick={() => setTab("html")} icon={<Code2 className="h-4 w-4" />}>
          Paste HTML
        </TabButton>
      </div>

      {tab === "templates" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                aria-label="Search templates"
                className="h-10 w-full rounded-xl border border-border/60 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:bg-slate-900"
              />
            </div>

            {templates.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No templates yet — use <b>Paste HTML</b> to create a design.
              </div>
            )}

            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {templates.map((t) => {
                const checked = picked === t.id;
                return (
                  <label
                    key={t.id}
                    className={`${matches(t) ? "flex" : "hidden"} cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                        : "border-border/60 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={checked}
                      onChange={() => setPicked(t.id)}
                      className="mt-1 h-4 w-4 accent-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{t.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {t.category}
                        </span>
                      </div>
                      {t.previewText && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{t.previewText}</div>}
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>Updated {t.updated}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            editAsHtml(t);
                          }}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          Edit as HTML
                        </button>
                      </div>
                    </div>
                  </label>
                );
              })}
              {templates.length > 0 && visible === 0 && (
                <div className="text-xs text-muted-foreground">No templates match &ldquo;{query}&rdquo;.</div>
              )}
            </div>
          </div>

          <PreviewPane
            title={pickedTemplate ? pickedTemplate.name : "Preview"}
            html={pickedTemplate?.html ?? ""}
            device={device}
            onDevice={setDevice}
            empty="Select a template to preview it."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-muted-foreground">HTML code</div>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload .html
                  </button>
                  {html && (
                    <button type="button" onClick={() => setHtml("")} className="font-medium text-muted-foreground hover:underline">
                      Clear
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => {
                    void loadFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                spellCheck={false}
                placeholder={'<!doctype html>\n<html>\n  <body>\n    <p>Hi {{ contact.FIRSTNAME | default : "there" }},</p>\n  </body>\n</html>'}
                aria-label="Email HTML"
                className="h-[560px] w-full resize-y rounded-xl border border-border/60 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200"
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                Personalise with <code>{'{{ contact.FIRSTNAME | default : "there" }}'}</code> or <code>{"{{first_name}}"}</code>. An
                unsubscribe footer is added automatically.
              </div>
            </div>

            <PreviewPane
              title="Live preview"
              html={deferredHtml}
              device={device}
              onDevice={setDevice}
              empty="Paste HTML on the left to see the email here."
            />
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="saveAsTemplate"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Save as template
              <span className="text-xs font-normal text-muted-foreground">— reuse this design in future campaigns</span>
            </label>
            {saveAsTemplate && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="templateName" className="text-xs font-medium">Template name</label>
                  <input
                    id="templateName"
                    name="templateName"
                    required
                    maxLength={200}
                    placeholder="e.g. Cohort update — Oct"
                    className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="templateCategory" className="text-xs font-medium">Category</label>
                  <select
                    id="templateCategory"
                    name="templateCategory"
                    defaultValue="Custom"
                    className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-emerald-400 dark:bg-slate-900"
                  >
                    {MARKETING_TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button as="a" href={`/marketing/campaigns/${campaignId}/edit`} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {tab === "html" && saveAsTemplate ? "Save design & template" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PreviewPane({
  title,
  html,
  device,
  onDevice,
  empty,
}: {
  title: string;
  html: string;
  device: Device;
  onDevice: (d: Device) => void;
  empty: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="truncate text-xs font-semibold text-muted-foreground">{title}</div>
        <div className="inline-flex rounded-lg border border-border/60 bg-slate-50 p-0.5 dark:bg-slate-800/50">
          <DeviceButton active={device === "desktop"} onClick={() => onDevice("desktop")} label="Desktop">
            <Monitor className="h-3.5 w-3.5" />
          </DeviceButton>
          <DeviceButton active={device === "mobile"} onClick={() => onDevice("mobile")} label="Mobile">
            <Smartphone className="h-3.5 w-3.5" />
          </DeviceButton>
        </div>
      </div>
      <div className="flex h-[560px] justify-center overflow-hidden rounded-xl border border-border/60 bg-slate-100 dark:bg-slate-800/40">
        {html.trim() ? (
          <iframe
            title={title}
            srcDoc={html}
            // No scripts, no same-origin: the preview can't touch the app.
            sandbox=""
            className={`h-full bg-white transition-all ${device === "mobile" ? "my-3 h-[calc(100%-1.5rem)] w-[375px] rounded-2xl border-4 border-slate-800 shadow-lg" : "w-full"}`}
          />
        ) : (
          <div className="grid place-items-center p-6 text-center text-sm text-muted-foreground">{empty}</div>
        )}
      </div>
    </div>
  );
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
        active ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-900" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {label}
    </button>
  );
}
