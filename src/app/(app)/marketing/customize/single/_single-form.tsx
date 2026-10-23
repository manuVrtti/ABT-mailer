"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Save, Send, Upload, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { confirmDialog, toast } from "@/components/overlay";
import { cn } from "@/lib/utils";
import { DIRECT_SEND_LIMITS, formatBytes } from "@/server/direct-send/body";
import {
  deleteDirectSendAttachment,
  launchDirectSendAction,
  saveSingleMail,
  sendDirectSendTest,
  uploadDirectSendAttachment,
} from "../actions";

const MAX_RECIPIENTS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SavedFile = { id: string; filename: string; size: number };

export function SingleMailForm({
  senders,
  defaultSender,
  me,
  draft,
}: {
  senders: { email: string; label: string }[];
  defaultSender: string;
  me: string;
  draft: {
    id: string;
    fromEmail: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    attachments: SavedFile[];
  } | null;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(draft?.id ?? null);
  const [fromEmail, setFromEmail] = useState(draft?.fromEmail ?? defaultSender);
  const [to, setTo] = useState<string[]>(draft?.to ?? []);
  const [cc, setCc] = useState<string[]>(draft?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(draft?.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(draft?.cc.length));
  const [showBcc, setShowBcc] = useState(Boolean(draft?.bcc.length));
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [saved, setSaved] = useState<SavedFile[]>(draft?.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [testTo, setTestTo] = useState(me);
  const [busy, setBusy] = useState<null | "send" | "draft" | "test">(null);
  const [status, setStatus] = useState<string | null>(null);
  const [, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const recipients = to.length + cc.length + bcc.length;
  const invalid = [...to, ...cc, ...bcc].filter((e) => !EMAIL_RE.test(e));
  const totalBytes = saved.reduce((n, f) => n + f.size, 0) + pendingFiles.reduce((n, f) => n + f.size, 0);
  const problem =
    senders.length === 0
      ? "You don't have a sender you can use. Ask an admin for sender access."
      : to.length === 0
        ? "Add at least one To address."
        : invalid.length
          ? `Fix ${invalid.length === 1 ? "this address" : "these addresses"}: ${invalid.slice(0, 3).join(", ")}`
          : recipients > MAX_RECIPIENTS
            ? `${recipients} recipients — one email can go to at most ${MAX_RECIPIENTS}.`
            : !subject.trim()
              ? "Add a subject."
              : !body.trim()
                ? "Write a message."
                : totalBytes > DIRECT_SEND_LIMITS.messageBytes
                  ? `Attachments total ${formatBytes(totalBytes)} (max ${formatBytes(DIRECT_SEND_LIMITS.messageBytes)}).`
                  : null;

  const addFiles = (files: File[]) => {
    const tooBig = files.filter((f) => f.size > DIRECT_SEND_LIMITS.fileBytes);
    if (tooBig.length)
      toast.error(
        "File too large",
        `${tooBig.map((f) => f.name).join(", ")} — max ${formatBytes(DIRECT_SEND_LIMITS.fileBytes)} each.`,
      );
    const ok = files.filter((f) => f.size > 0 && f.size <= DIRECT_SEND_LIMITS.fileBytes);
    // Same name replaces the earlier file, as on the server.
    setPendingFiles((cur) => [...cur.filter((c) => !ok.some((f) => f.name === c.name)), ...ok]);
    setSaved((cur) => cur.filter((s) => !ok.some((f) => f.name.replace(/[\\/]/g, "_") === s.filename)));
  };

  /** Save the draft and upload new files; returns the draft id. */
  async function persist(): Promise<string> {
    setStatus("Saving…");
    const r = await saveSingleMail({ id: id ?? undefined, fromEmail, to, cc, bcc, subject, body });
    if (!r.ok) throw new Error(r.error);
    if (!id) {
      setId(r.id);
      window.history.replaceState(null, "", `/marketing/customize/single?id=${r.id}`);
    }
    const files = [...pendingFiles];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      setStatus(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
      const fd = new FormData();
      fd.set("id", r.id);
      fd.set("file", f);
      fd.set("forAll", "1");
      const u = await uploadDirectSendAttachment(fd);
      if (!u.ok) throw new Error(u.error);
      setSaved((cur) => [...cur.filter((s) => s.filename !== u.attachment.filename), u.attachment]);
      setPendingFiles((cur) => cur.filter((c) => c !== f));
    }
    setStatus(null);
    return r.id;
  }

  const run = (kind: "send" | "draft" | "test", fn: () => Promise<void>) =>
    start(async () => {
      setBusy(kind);
      try {
        await fn();
      } catch (err) {
        toast.error("Couldn't finish", (err as Error).message);
        setStatus(null);
      } finally {
        setBusy(null);
      }
    });

  const send = async () => {
    const ok = await confirmDialog({
      title: `Send this email to ${recipients} ${recipients === 1 ? "person" : "people"}?`,
      message: (
        <span className="block space-y-0.5 break-all">
          <span className="block">To: {to.join(", ")}</span>
          {cc.length > 0 && <span className="block">CC: {cc.join(", ")}</span>}
          {bcc.length > 0 && <span className="block">BCC: {bcc.join(", ")}</span>}
        </span>
      ),
      confirmLabel: "Send now",
    });
    if (!ok) return;
    run("send", async () => {
      const draftId = await persist();
      setStatus("Sending…");
      const r = await launchDirectSendAction(draftId);
      if (!r.ok) throw new Error(r.error);
      toast.success("Email sent", r.message);
      router.push(`/marketing/customize/${draftId}`);
    });
  };

  const saveDraft = () =>
    run("draft", async () => {
      const draftId = await persist();
      toast.success("Draft saved");
      router.push(`/marketing/customize/${draftId}`);
    });

  const test = () =>
    run("test", async () => {
      if (!EMAIL_RE.test(testTo.trim())) throw new Error("Enter a valid email for the test.");
      const draftId = await persist();
      setStatus("Sending test…");
      const r = await sendDirectSendTest(draftId, 1, testTo);
      setStatus(null);
      if (!r.ok) throw new Error(r.error);
      toast.success("Test sent", `Sent to ${testTo.trim()} (CC and BCC are left out of tests).`);
    });

  const disabled = busy !== null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="from">From</Label>
          <Select
            id="from"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            disabled={disabled}
            className="w-full"
          >
            {senders.map((s) => (
              <option key={s.email} value={s.email}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>To</Label>
            <div className="flex gap-3 text-xs font-medium">
              {!showCc && (
                <button
                  type="button"
                  className="text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => setShowCc(true)}
                >
                  + CC
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  className="text-brand-700 hover:underline dark:text-brand-300"
                  onClick={() => setShowBcc(true)}
                >
                  + BCC
                </button>
              )}
            </div>
          </div>
          <RecipientInput
            value={to}
            onChange={setTo}
            placeholder="name@gmail.com, name@outlook.com…"
            disabled={disabled}
            autoFocus={!draft}
          />
        </div>
        {showCc && (
          <div>
            <Label>CC</Label>
            <RecipientInput
              value={cc}
              onChange={setCc}
              placeholder="Everyone sees these addresses"
              disabled={disabled}
            />
          </div>
        )}
        {showBcc && (
          <div>
            <Label>BCC</Label>
            <RecipientInput
              value={bcc}
              onChange={setBcc}
              placeholder="Hidden from the other recipients"
              disabled={disabled}
            />
          </div>
        )}

        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={DIRECT_SEND_LIMITS.subjectChars}
            disabled={disabled}
            className="w-full"
          />
        </div>

        <div>
          <Label htmlFor="body">Message</Label>
          <Textarea
            id="body"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Hi Asha,\n\nPlease find the offer letter attached.\n\nThanks,\nTeam ABTalks"}
            disabled={disabled}
            className="w-full"
          />
          <p className="mt-1 text-2xs text-muted-foreground">
            Plain text keeps your line breaks and turns links into clickable links. You can also paste HTML.
          </p>
        </div>

        <div>
          <Label>Attachments</Label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-3 text-sm transition-colors",
              dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30" : "border-border",
            )}
          >
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Add files
            </Button>
            <span className="text-xs text-muted-foreground">
              or drop them here · max {formatBytes(DIRECT_SEND_LIMITS.fileBytes)} each
              {totalBytes > 0 && ` · ${formatBytes(totalBytes)} total`}
            </span>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>
          {(saved.length > 0 || pendingFiles.length > 0) && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {saved.map((f) => (
                <FileChip
                  key={f.id}
                  name={f.filename}
                  size={f.size}
                  disabled={disabled}
                  onRemove={() =>
                    run("draft", async () => {
                      if (id) await deleteDirectSendAttachment(id, f.id);
                      setSaved((cur) => cur.filter((s) => s.id !== f.id));
                    })
                  }
                />
              ))}
              {pendingFiles.map((f) => (
                <FileChip
                  key={f.name}
                  name={f.name}
                  size={f.size}
                  disabled={disabled}
                  onRemove={() => setPendingFiles((cur) => cur.filter((c) => c !== f))}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@abtalks.in"
            className="w-56"
            disabled={disabled}
            aria-label="Send a test to"
          />
          <Button type="button" variant="secondary" onClick={test} disabled={disabled || Boolean(problem)}>
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send test
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={saveDraft}
            disabled={disabled || Boolean(problem)}
          >
            {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
            Save draft
          </Button>
          <Button type="button" onClick={send} disabled={disabled || Boolean(problem)}>
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {recipients > 1 ? ` Send to ${recipients}` : " Send"}
          </Button>
        </div>
        {(status || problem) && (
          <p
            className={cn(
              "w-full text-xs",
              status ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300",
            )}
          >
            {status ?? problem}
          </p>
        )}
      </Card>
    </div>
  );
}

function FileChip({
  name,
  size,
  disabled,
  onRemove,
}: {
  name: string;
  size: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1 text-xs">
      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground">{formatBytes(size)}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        title="Remove"
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-rose-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Email addresses as chips: type and press Enter, comma or space; paste a whole list. */
function RecipientInput({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const commit = (raw: string) => {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) =>
        p
          .replace(/^.*<([^>]+)>.*$/, "$1")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setText("");
  };
  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
        disabled && "opacity-60",
      )}
    >
      {value.map((e) => {
        const ok = EMAIL_RE.test(e);
        return (
          <span
            key={e}
            className={cn(
              "inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs",
              ok
                ? "bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200"
                : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
            )}
            title={ok ? undefined : "Not a valid email address"}
          >
            {e}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((x) => x !== e))}
              className="rounded-full p-0.5 hover:bg-black/10"
              aria-label={`Remove ${e}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      <input
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;\s]$/.test(v)) commit(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (/[\s,;]/.test(pasted.trim())) {
            e.preventDefault();
            commit(text + pasted);
          }
        }}
        onBlur={() => commit(text)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[12rem] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
