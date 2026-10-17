"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Copy, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { deleteCampaign, duplicateCampaign } from "./actions";
import { confirmDialog, toast } from "@/components/overlay";

/**
 * Per-row ⋮ menu on the campaigns list (Brevo-style): Edit, View report,
 * Duplicate, Delete. Edit only for drafts and scheduled campaigns; Delete is
 * disabled while a campaign is in flight.
 */
export function CampaignRowMenu({
  id,
  name,
  editable,
  blockedReason,
}: {
  id: string;
  name: string;
  editable: boolean;
  /** Set when the campaign is in flight and must be cancelled before deleting. */
  blockedReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800/60";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-border/60 bg-white py-1 shadow-lg dark:bg-slate-900"
        >
          {editable && (
            <Link role="menuitem" href={`/marketing/campaigns/${id}/edit`} className={item} onClick={() => setOpen(false)}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
              Edit
            </Link>
          )}
          <Link role="menuitem" href={`/marketing/campaigns/${id}`} className={item} onClick={() => setOpen(false)}>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            View report
          </Link>
          <button
            role="menuitem"
            type="button"
            className={item}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await duplicateCampaign(id);
                setOpen(false);
                if (!res.ok) return toast.error("Couldn't duplicate", res.error);
                router.push(`/marketing/campaigns/${res.id}/edit`);
              })
            }
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            Duplicate
          </button>
          <div className="my-1 border-t border-border/60" />
          <button
            role="menuitem"
            type="button"
            className={`${item} text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10`}
            disabled={pending || Boolean(blockedReason)}
            title={blockedReason}
            onClick={async () => {
              setOpen(false);
              const ok = await confirmDialog({
                title: `Delete “${name}”?`,
                message: "This removes the campaign and its stats. It can't be undone.",
                confirmLabel: "Delete campaign",
                tone: "danger",
              });
              if (!ok) return;
              start(async () => {
                const res = await deleteCampaign(id);
                if (res.ok) toast.success("Campaign deleted");
                else toast.error("Couldn't delete", res.error);
              });
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
