"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { deleteList } from "../actions";
import { confirmDialog } from "@/components/overlay";

export function DeleteListButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const ok = await confirmDialog({
          title: `Delete the list “${name}”?`,
          message: "Its members stay in Contacts — only the list is deleted.",
          confirmLabel: "Delete list",
          tone: "danger",
        });
        if (ok) start(() => deleteList(id));
      }}
      className={buttonClasses("secondary", "md", "text-red-600 hover:text-red-700")}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Deleting…" : "Delete list"}
    </button>
  );
}
