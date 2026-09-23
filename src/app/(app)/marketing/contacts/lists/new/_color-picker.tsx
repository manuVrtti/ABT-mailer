"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const SWATCH: Record<string, string> = {
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

export function ColorPicker({ options, defaultValue = "emerald" }: { options: string[]; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      <input type="hidden" name="color" value={value} />
      {options.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setValue(c)}
            className={cn(
              "relative grid h-9 w-9 place-items-center rounded-full transition",
              SWATCH[c] ?? "bg-slate-500",
              active ? "ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-slate-900" : "opacity-70 hover:opacity-100",
            )}
            aria-label={c}
          >
            {active && <Check className="h-4 w-4 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
