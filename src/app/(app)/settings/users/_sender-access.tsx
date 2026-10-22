"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, ShieldCheck, X } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { toast } from "@/components/overlay";
import { cn } from "@/lib/utils";
import { setUserSenderAccess } from "./actions";

type BrandOption = { key: string; name: string; domain: string };

/** "Can send as" cell: the current access and an editor for admins. */
export function SenderAccessCell({
  userId,
  name,
  isAdmin,
  allSenders,
  brandKeys,
  brands,
  summary,
}: {
  userId: string;
  name: string;
  isAdmin: boolean;
  allSenders: boolean;
  brandKeys: string[];
  brands: BrandOption[];
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const limited = !isAdmin && !allSenders;
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset",
          limited
            ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900"
            : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
        )}
      >
        <Send className="h-3 w-3" /> {summary}
      </span>
      {!isAdmin && (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
          Edit
        </button>
      )}
      {open && (
        <AccessDialog
          userId={userId}
          name={name}
          initialAll={allSenders}
          initialKeys={brandKeys}
          brands={brands}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AccessDialog({
  userId,
  name,
  initialAll,
  initialKeys,
  brands,
  onClose,
}: {
  userId: string;
  name: string;
  initialAll: boolean;
  initialKeys: string[];
  brands: BrandOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [all, setAll] = useState(initialAll);
  const [keys, setKeys] = useState<string[]>(initialKeys);
  const [pending, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () =>
    start(async () => {
      const r = await setUserSenderAccess(userId, all, keys);
      if (!r.ok) {
        toast.error("Couldn't save access", r.error);
        return;
      }
      toast.success("Access updated", `${name} can now send as ${all ? "every sender" : brands.filter((b) => keys.includes(b.key)).map((b) => b.name).join(", ")}.`);
      onClose();
      router.refresh();
    });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md animate-pop-in rounded-xl border border-border bg-card p-5 shadow-pop">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Sender access</h2>
              <p className="text-sm text-muted-foreground">{name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
            all ? "border-brand-500 bg-brand-50/60 dark:bg-brand-950/30" : "border-border",
          )}
        >
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>
            <span className="block text-sm font-medium">All senders</span>
            <span className="block text-xs text-muted-foreground">Every brand, including ones added later.</span>
          </span>
        </label>

        <div className={cn("mt-3 space-y-1.5", all && "pointer-events-none opacity-50")}>
          <div className="text-xs font-medium text-muted-foreground">Or only these brands</div>
          {brands.map((b) => (
            <label key={b.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 hover:bg-muted/50">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={keys.includes(b.key)}
                onChange={(e) => setKeys((k) => (e.target.checked ? [...k, b.key] : k.filter((x) => x !== b.key)))}
              />
              <span className="flex-1 text-sm font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">@{b.domain}</span>
            </label>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          They&apos;ll only see campaigns, personal mails, logs, analytics and templates of these brands, and can only send as them.
          Contacts, lists and segments stay shared.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary")} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={buttonClasses("primary")} disabled={pending || (!all && keys.length === 0)} onClick={save}>
            {pending ? "Saving…" : "Save access"}
          </button>
        </div>
      </div>
    </div>
  );
}
