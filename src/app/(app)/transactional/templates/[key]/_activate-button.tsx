"use client";
import { useTransition } from "react";
import { activateTransactionalVersion } from "../../actions";
import { Button } from "@/components/ui";

export function ActivateButton({ templateKey, version }: { templateKey: string; version: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() => start(() => activateTransactionalVersion(templateKey, version))}
    >
      {pending ? "Activating…" : "Activate"}
    </Button>
  );
}
