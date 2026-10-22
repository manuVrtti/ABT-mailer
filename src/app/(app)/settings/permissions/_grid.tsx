"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, RotateCcw } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { toast } from "@/components/overlay";
import { cn } from "@/lib/utils";
import { saveRolePermissions } from "./actions";

type Roles = "MARKETER" | "VIEWER";

export function PermissionsGrid({
  permissions,
  initial,
  defaults,
  people,
}: {
  permissions: { key: string; label: string; hint: string }[];
  initial: Record<Roles, string[]>;
  defaults: Record<Roles, readonly string[]>;
  people: Record<"ADMIN" | Roles, number>;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<Roles, string[]>>(initial);
  const [pending, start] = useTransition();
  const dirty = useMemo(
    () =>
      (["MARKETER", "VIEWER"] as Roles[]).some(
        (r) => [...state[r]].sort().join() !== [...initial[r]].sort().join(),
      ),
    [state, initial],
  );

  const toggle = (role: Roles, key: string) =>
    setState((s) => ({
      ...s,
      [role]: s[role].includes(key) ? s[role].filter((k) => k !== key) : [...s[role], key],
    }));

  const save = () =>
    start(async () => {
      const r = await saveRolePermissions(state);
      if (r.ok) toast.success("Permissions saved", "They apply right away to everyone with these roles.");
      else toast.error("Couldn't save", r.error);
      router.refresh();
    });

  const ROLE_COLS: { role: "ADMIN" | Roles; label: string }[] = [
    { role: "ADMIN", label: "Admin" },
    { role: "MARKETER", label: "Marketer" },
    { role: "VIEWER", label: "Viewer" },
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Permission</th>
              {ROLE_COLS.map((c) => (
                <th key={c.role} className="w-32 px-4 py-3 text-center font-medium">
                  <div className="text-foreground">{c.label}</div>
                  <div className="text-2xs font-normal">
                    {people[c.role]} {people[c.role] === 1 ? "person" : "people"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key} className="border-t border-border first:border-t-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.hint}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="inline-grid h-5 w-5 place-items-center rounded bg-muted text-muted-foreground"
                    title="Admins can always do everything"
                  >
                    <Lock className="h-3 w-3" />
                  </span>
                </td>
                {(["MARKETER", "VIEWER"] as Roles[]).map((role) => {
                  const on = state[role].includes(p.key);
                  return (
                    <td key={role} className="px-4 py-3 text-center">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${p.label} for ${role.toLowerCase()}`}
                        onClick={() => toggle(role, p.key)}
                        className={cn(
                          "inline-grid h-5 w-5 place-items-center rounded border transition-colors",
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-input bg-background hover:border-brand-400",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Always admin-only: Settings (users, senders, suppressions, audit log, these permissions) and
          deleting templates, segments or logs.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClasses("ghost")}
            disabled={pending}
            onClick={() => setState({ MARKETER: [...defaults.MARKETER], VIEWER: [...defaults.VIEWER] })}
          >
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </button>
          <button
            type="button"
            className={buttonClasses("primary")}
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}
