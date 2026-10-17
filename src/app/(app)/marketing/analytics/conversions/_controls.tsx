"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Search, Target, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { toast } from "@/components/overlay";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type ConversionGoal } from "@/server/conversions/kinds";
import { loadGoalOptions, refreshConversionsNow, setCampaignGoal, type GoalOption } from "./actions";

export function RefreshConversionsButton({ size = "md" }: { size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshConversionsNow();
          if (r.ok) toast.success("Conversions refreshed", r.message);
          else toast.error("Couldn't refresh conversions", r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {pending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

/** Shows a campaign's goal and lets editors pick one from Klymb events / cohorts. */
export function GoalPicker({ campaignId, goal, canEdit }: { campaignId: string; goal: ConversionGoal | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<GoalOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || options) return;
    loadGoalOptions().then((r) => (r.ok ? setOptions(r.options) : setError(r.error)));
  }, [open, options]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const shown = useMemo(
    () => (options ?? []).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  );

  const save = (g: GoalOption | null) =>
    start(async () => {
      const r = await setCampaignGoal(campaignId, g ? { kind: g.kind, ref: g.ref, label: g.label } : null);
      if (r.ok) toast.success(r.message);
      else toast.error("Couldn't save the goal", r.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <div ref={box} className="relative">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Target className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Goal:</span>
        <span className="font-medium">{goal ? goal.label ?? KIND_LABELS[goal.kind] : "Any action"}</span>
        {canEdit && (
          <>
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              {goal ? "Change" : "Set a goal"}
            </button>
            {goal && (
              <button type="button" disabled={pending} onClick={() => save(null)} className="text-xs text-muted-foreground hover:text-red-600">
                Remove
              </button>
            )}
          </>
        )}
      </div>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-[min(440px,90vw)] animate-pop-in rounded-lg border border-border bg-card p-2 shadow-pop">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, cohorts…" className="pl-8" />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {!options && !error && (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading from Klymb…
              </div>
            )}
            {error && <div className="px-2 py-3 text-sm text-destructive">{error}</div>}
            {shown.map((o) => {
              const active = goal?.kind === o.kind && (goal.ref ?? null) === (o.ref ?? null);
              return (
                <button
                  key={`${o.kind}:${o.ref ?? "*"}`}
                  type="button"
                  disabled={pending}
                  onClick={() => save(o)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                    active && "bg-brand-50 font-medium text-brand-800 dark:bg-brand-950/50 dark:text-brand-200",
                    !o.ref && "font-medium",
                  )}
                >
                  <span className={cn("truncate", o.ref && "pl-3 text-foreground/80")}>{o.label}</span>
                  {o.count !== undefined && <span className="shrink-0 text-xs text-muted-foreground">{o.count.toLocaleString()}</span>}
                </button>
              );
            })}
            {options && shown.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">No match.</div>}
          </div>
          <div className="mt-1 flex justify-end border-t border-border pt-2">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" /> Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
