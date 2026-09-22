"use client";
import { useTransition } from "react";
import { toggleEventRule } from "../actions";

export function ToggleRule({ eventType, isActive }: { eventType: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => toggleEventRule(eventType, !isActive))}
      disabled={pending}
      className="text-xs underline underline-offset-4 disabled:opacity-50"
    >
      {pending ? "…" : isActive ? "Disable" : "Enable"}
    </button>
  );
}
