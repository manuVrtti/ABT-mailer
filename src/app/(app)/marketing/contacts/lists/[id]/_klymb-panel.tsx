"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, X } from "lucide-react";
import type { ListOverrideMode } from "@prisma/client";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { addKlymbListOverrides, refreshKlymbListNow, removeKlymbListOverride } from "../klymb-actions";

export function RefreshKlymbButton({ listId }: { listId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="border-white/40 text-slate-900 dark:text-white"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await refreshKlymbListNow(listId);
            setMsg(
              res.ok
                ? `Refreshed: +${res.stats.added} added, −${res.stats.removed} removed`
                : `Refresh failed: ${res.error}`,
            );
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
        {pending ? "Refreshing from Klymb…" : "Refresh now"}
      </Button>
      {msg && <span className="text-[11px] text-white/90">{msg}</span>}
    </div>
  );
}

export function KlymbOverridesPanel({
  listId,
  overrides,
}: {
  listId: string;
  overrides: { email: string; mode: ListOverrideMode }[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (mode: ListOverrideMode) =>
    start(async () => {
      setMsg(null);
      const res = await addKlymbListOverrides(listId, text, mode);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setText("");
      setMsg(
        [
          `Saved ${res.saved} address${res.saved === 1 ? "" : "es"} as always ${mode === "INCLUDE" ? "include" : "exclude"}.`,
          res.invalid.length ? `Skipped invalid: ${res.invalid.slice(0, 5).join(", ")}${res.invalid.length > 5 ? "…" : ""}.` : "",
          res.refreshError ? `Refresh failed: ${res.refreshError}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
    });

  const includes = overrides.filter((o) => o.mode === "INCLUDE");
  const excludes = overrides.filter((o) => o.mode === "EXCLUDE");

  return (
    <Card className="space-y-3">
      <div>
        <div className="text-sm font-medium">Add or remove people by hand</div>
        <p className="text-xs text-muted-foreground">
          These stay in effect on every refresh. Removing someone with the ✕ in the members table also adds them to
          &quot;always exclude&quot;.
        </p>
      </div>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="one@example.com, two@example.com"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={() => save("INCLUDE")}>
          Always include
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || !text.trim()}
          onClick={() => save("EXCLUDE")}
        >
          Always exclude
        </Button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>

      {(includes.length > 0 || excludes.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <OverrideColumn title="Always include" tone="success" listId={listId} rows={includes} />
          <OverrideColumn title="Always exclude" tone="destructive" listId={listId} rows={excludes} />
        </div>
      )}
    </Card>
  );
}

function OverrideColumn({
  title,
  tone,
  listId,
  rows,
}: {
  title: string;
  tone: "success" | "destructive";
  listId: string;
  rows: { email: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        {title} <Badge tone={tone}>{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">None.</div>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li key={r.email} className="flex items-center justify-between gap-2">
              <span className="truncate">{r.email}</span>
              <button
                type="button"
                disabled={pending}
                title="Remove this exception"
                onClick={() =>
                  start(async () => {
                    await removeKlymbListOverride(listId, r.email);
                    router.refresh();
                  })
                }
                className="rounded p-0.5 text-muted-foreground hover:text-rose-500 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
