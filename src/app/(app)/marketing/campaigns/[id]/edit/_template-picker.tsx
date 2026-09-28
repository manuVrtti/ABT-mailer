"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui";

type TemplateOption = {
  id: string;
  name: string;
  category: string;
  previewText: string | null;
  updated: string;
};

/** Design section chooser: searchable template list (name, category, preview text). */
export function TemplatePicker({
  campaignId,
  templates,
  selectedId,
}: {
  campaignId: string;
  templates: TemplateOption[];
  selectedId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(selectedId);

  const q = query.trim().toLowerCase();
  const matches = (t: TemplateOption) =>
    !q || [t.name, t.category, t.previewText ?? ""].some((s) => s.toLowerCase().includes(q));
  const visible = templates.filter(matches).length;

  return (
    <div className="space-y-3">
      <input type="hidden" name="id" value={campaignId} />
      {picked && <input type="hidden" name="templateId" value={picked} />}

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

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
                <div className="mt-1 text-[11px] text-muted-foreground">Updated {t.updated}</div>
              </div>
            </label>
          );
        })}
      </div>
      {visible === 0 && <div className="text-xs text-muted-foreground">No templates match &ldquo;{query}&rdquo;.</div>}

      <div className="flex justify-end gap-2 pt-1">
        <Button as="a" href={`/marketing/campaigns/${campaignId}/edit`} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" disabled={!picked}>
          Save
        </Button>
      </div>
    </div>
  );
}
