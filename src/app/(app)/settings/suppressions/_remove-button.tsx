"use client";
import { useTransition } from "react";
import { removeSuppression } from "./actions";
import { confirmDialog } from "@/components/overlay";

export function RemoveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirmDialog({
          title: "Remove this suppression?",
          message: "This address will start receiving emails again.",
          confirmLabel: "Remove",
          tone: "danger",
        });
        if (ok) start(() => removeSuppression(id));
      }}
      disabled={pending}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive disabled:opacity-50"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
