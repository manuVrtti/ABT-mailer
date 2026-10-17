"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { deleteLogEmail, resendLogEmail } from "./actions";
import { confirmDialog } from "@/components/overlay";

export function LogActions({ jobId, canDelete }: { jobId: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    const ok = await confirmDialog({
      title: "Send this email again?",
      message: "The same email goes to the same recipient as a new send.",
      confirmLabel: "Resend",
    });
    if (!ok) return;
    start(async () => {
      const res = await resendLogEmail(jobId);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: "Resent. Opening the new email…" });
      router.push(`/transactional/logs/${res.jobId}`);
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: "Delete this log?",
      message: "Its delivery events are removed too. This can't be undone.",
      confirmLabel: "Delete log",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteLogEmail(jobId);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      router.push("/transactional/logs");
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {canDelete && (
          <Button type="button" variant="secondary" onClick={remove} disabled={pending} className="text-destructive">
            <Trash2 className="mr-1 h-4 w-4" />
            Delete log
          </Button>
        )}
        <Button type="button" onClick={resend} disabled={pending}>
          <Send className="mr-1 h-4 w-4" />
          {pending ? "Working…" : "Resend email"}
        </Button>
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{message.text}</p>
      )}
    </div>
  );
}
