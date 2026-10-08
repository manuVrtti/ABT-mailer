"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { deleteLogEmail, resendLogEmail } from "./actions";

export function LogActions({ jobId, canDelete }: { jobId: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function resend() {
    if (!confirm("Send this email to the same recipient again?")) return;
    start(async () => {
      const res = await resendLogEmail(jobId);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: "Resent. Opening the new email…" });
      router.push(`/transactional/logs/${res.jobId}`);
    });
  }

  function remove() {
    if (!confirm("Delete this log? Its delivery events are removed too. This can't be undone.")) return;
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
