"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteList } from "../actions";

export function DeleteListButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete list "${name}"? Members remain as contacts; only the list is deleted.`)) {
          start(() => deleteList(id));
        }
      }}
      className="inline-flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-white/30 disabled:opacity-60"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Deleting…" : "Delete list"}
    </button>
  );
}
