"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { removeMember } from "../actions";

export function RemoveMemberButton({ listId, contactId }: { listId: string; contactId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => removeMember(listId, contactId))}
      disabled={pending}
      title="Remove from list"
      className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/30"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
