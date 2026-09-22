"use client";
import { useTransition } from "react";
import { removeSuppression } from "./actions";

export function RemoveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm("Remove this suppression? The recipient will start receiving emails again.")) {
          start(() => removeSuppression(id));
        }
      }}
      disabled={pending}
      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive disabled:opacity-50"
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}
