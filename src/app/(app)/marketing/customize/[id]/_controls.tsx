"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Paperclip, Send, Trash2, Upload, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { formatBytes } from "@/server/direct-send/body";
import {
  cancelDirectSendAction,
  deleteDirectSend,
  deleteDirectSendAttachment,
  launchDirectSendAction,
  sendDirectSendTest,
  setAttachmentForAll,
  uploadDirectSendAttachment,
} from "../actions";
import { confirmDialog, toast } from "@/components/overlay";

/** Re-render the server page every few seconds while a batch is sending. */
export function AutoRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

export function TestSend({ id, rowNumber, defaultTo }: { id: string; rowNumber: number; defaultTo: string }) {
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="flex gap-2">
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@abtalks.in" />
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !to}
          onClick={() =>
            start(async () => {
              const r = await sendDirectSendTest(id, rowNumber, to);
              setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send test"}
        </Button>
      </div>
      {msg && (
        <p
          className={`mt-1 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function LaunchButton({
  id,
  count,
  disabled,
  label,
  confirmTitle,
  confirmMessage,
}: {
  id: string;
  count: number;
  disabled?: boolean;
  label?: string;
  confirmTitle?: string;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={pending || disabled}
        onClick={async () => {
          const ok = await confirmDialog({
            title:
              confirmTitle ?? `Send ${count.toLocaleString()} personal email${count === 1 ? "" : "s"} now?`,
            message:
              confirmMessage ?? "Each person gets their own row's email and files. This can't be undone.",
            confirmLabel: "Send now",
          });
          if (!ok) return;
          start(async () => {
            const r = await launchDirectSendAction(id);
            setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
            router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
        {pending ? "Queuing…" : (label ?? `Send ${count.toLocaleString()} emails`)}
      </Button>
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="destructive"
      disabled={pending}
      onClick={async () => {
        const ok = await confirmDialog({
          title: "Stop sending this batch?",
          message: "Emails that haven't gone out yet will be skipped.",
          confirmLabel: "Stop sending",
          cancelLabel: "Keep sending",
          tone: "danger",
        });
        if (!ok) return;
        start(async () => {
          const r = await cancelDirectSendAction(id);
          if (r.ok) toast.success(r.message);
          router.refresh();
        });
      }}
    >
      <Ban className="mr-1 h-4 w-4" /> {pending ? "Stopping…" : "Stop sending"}
    </Button>
  );
}

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={async () => {
        const ok = await confirmDialog({
          title: `Delete “${name}”?`,
          message: "Its rows and attached files are removed. Emails already sent stay in Logs.",
          confirmLabel: "Delete batch",
          tone: "danger",
        });
        if (!ok) return;
        start(async () => {
          const r = await deleteDirectSend(id);
          if (r.ok) {
            toast.success("Batch deleted");
            router.push("/marketing/customize");
          } else toast.error("Couldn't delete", r.error);
        });
      }}
    >
      <Trash2 className="mr-1 h-4 w-4" /> Delete
    </Button>
  );
}

export function AttachmentsManager({
  id,
  editable,
  attachments,
  missing,
}: {
  id: string;
  editable: boolean;
  attachments: { id: string; filename: string; size: number; forAll: boolean; uses: number }[];
  missing: { name: string; rows: number }[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const upload = (files: File[]) =>
    start(async () => {
      setMsg(null);
      for (let i = 0; i < files.length; i++) {
        setMsg(`Uploading ${i + 1} of ${files.length}: ${files[i]!.name}`);
        const fd = new FormData();
        fd.set("id", id);
        fd.set("file", files[i]!);
        fd.set("forAll", "0");
        const r = await uploadDirectSendAttachment(fd);
        if (!r.ok) {
          setMsg(r.error);
          router.refresh();
          return;
        }
      }
      setMsg(null);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {attachments.length === 0 && missing.length === 0 && (
        <p className="text-sm text-muted-foreground">No attachments.</p>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border/70 empty:hidden">
        {attachments.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{a.filename}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(a.size)}</span>
            <span className="text-xs text-muted-foreground">
              {a.forAll ? "every email" : a.uses ? `${a.uses} row${a.uses === 1 ? "" : "s"}` : "not used"}
            </span>
            {editable && (
              <>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={a.forAll}
                    disabled={pending}
                    onChange={(e) =>
                      start(async () => {
                        await setAttachmentForAll(id, a.id, e.target.checked);
                        router.refresh();
                      })
                    }
                  />
                  Everyone
                </label>
                <button
                  type="button"
                  disabled={pending}
                  title="Remove"
                  onClick={() =>
                    start(async () => {
                      await deleteDirectSendAttachment(id, a.id);
                      router.refresh();
                    })
                  }
                  className="rounded p-1 text-muted-foreground hover:text-rose-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
        {missing.map((m) => (
          <li
            key={m.name}
            className="flex items-center gap-3 bg-red-50/60 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200"
          >
            <Paperclip className="h-4 w-4" />
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs">needed by {m.rows} row(s) — upload it</span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload files
          </Button>
          <span className="text-xs text-muted-foreground">
            Max 4 MB each. A file with the same name replaces the old one.
          </span>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) upload(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
