"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

type Option = { key: string; label: string };

/** Period presets, custom dates, mail types (any combination), brand and chart grouping. */
export function AnalyticsFilters({
  presets,
  preset,
  fromDay,
  toDay,
  types,
  selectedTypes,
  brands,
  brand,
  by,
  autoBy,
}: {
  presets: Option[];
  preset: string;
  fromDay: string;
  toDay: string;
  types: Option[];
  selectedTypes: string[];
  brands: Option[];
  brand: string;
  by: string;
  autoBy: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);
  const [customOpen, setCustomOpen] = useState(preset === "custom");

  const go = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    router.push(`${pathname}${s ? `?${s}` : ""}`);
  };

  const toggleType = (key: string) => {
    const next = selectedTypes.includes(key)
      ? selectedTypes.filter((t) => t !== key)
      : [...selectedTypes, key];
    if (next.length === 0) return; // at least one type
    go({ types: next.length === types.length ? undefined : next.join(",") });
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
      active
        ? "border-brand-500 bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets
          .filter((p) => p.key !== "custom")
          .map((p) => (
            <button
              key={p.key}
              type="button"
              className={chip(preset === p.key)}
              onClick={() => {
                setCustomOpen(false);
                go({ preset: p.key === "last_30" ? undefined : p.key, from: undefined, to: undefined });
              }}
            >
              {p.label}
            </button>
          ))}
        <button
          type="button"
          className={chip(preset === "custom" || customOpen)}
          onClick={() => setCustomOpen((v) => !v)}
        >
          <CalendarRange className="h-3.5 w-3.5" /> Custom
        </button>
      </div>

      {customOpen && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ preset: "custom", from, to });
          }}
        >
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" size="sm" disabled={!from || !to}>
            Apply
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Type</span>
          {types.map((t) => {
            const on = selectedTypes.includes(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={chip(on)}
                title={on && selectedTypes.length === 1 ? "At least one type stays selected" : undefined}
                onClick={() => toggleType(t.key)}
              >
                <span
                  className={cn(
                    "grid h-3.5 w-3.5 place-items-center rounded-sm border",
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-input",
                  )}
                >
                  {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>

        {brands.length > 1 && (
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Brand
            <Select
              value={brand}
              onChange={(e) => go({ brand: e.target.value || undefined })}
              className="h-8 w-auto text-xs"
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="mr-1 font-medium text-muted-foreground">Chart by</span>
          {[
            { key: "day", label: "Day" },
            { key: "week", label: "Week" },
            { key: "month", label: "Month" },
          ].map((g) => (
            <button
              key={g.key}
              type="button"
              className={chip(by === g.key)}
              onClick={() => go({ by: g.key })}
            >
              {g.label}
            </button>
          ))}
          {!autoBy && (
            <button
              type="button"
              className="ml-1 text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => go({ by: undefined })}
            >
              auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
