"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteCampaign } from "./actions";

export function DeleteCampaignButton({
  id,
  name,
  blockedReason,
}: {
  id: string;
  name: string;
  /** Set when the campaign is in flight and must be cancelled first. */
  blockedReason?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      title={blockedReason ?? `Delete “${name}”`}
      aria-label={`Delete ${name}`}
      disabled={pending || Boolean(blockedReason)}
      onClick={() => {
        if (!confirm(`Delete “${name}”? This removes the campaign and its stats. It can’t be undone.`)) return;
        start(async () => {
          const res = await deleteCampaign(id);
          if (!res.ok) alert(res.error);
        });
      }}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground dark:hover:bg-rose-500/10"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
