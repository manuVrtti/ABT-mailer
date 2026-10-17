"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileX2,
  Files,
  Info,
  Loader2,
  Mail,
  Megaphone,
  Paperclip,
  Trash2,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Button, Input, Select, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  buildRowEmail,
  checkRows,
  detectColumns,
  fileMatches,
  fillVariables,
  matchFilesToPerson,
  DIRECT_SEND_LIMITS,
  formatBytes,
  isBlocking,
  ISSUE_LABELS,
  toRows,
  type ColumnMap,
  type ColumnRole,
  type DirectRow,
} from "@/server/direct-send/body";
import { createDirectSend, uploadDirectSendAttachment } from "../actions";

type Kind = "PERSONAL" | "MARKETING";
type LocalFile = { file: File; forAll: boolean };
type AttachMode = "none" | "same" | "per_person";

const ROLE_LABELS: Record<ColumnRole, string> = {
  email: "Email",
  name: "Name",
  subject: "Subject",
  body: "Body",
  attachment: "Attachment(s)",
};
const REQUIRED: ColumnRole[] = ["email", "subject", "body"];

const SAMPLE_CSV = [
  "email,name,subject,body,attachment",
  'asha@example.com,Asha,"Your offer letter, {{name}}","Hi {{name}},\n\nCongratulations! Your offer letter is attached.\n\nRegards,\nABTalks team",asha_offer.pdf',
  'ravi@example.com,Ravi,Interview on Monday,"Hi {{name}},\n\nYour interview is on Monday at 11 am: https://meet.example.com/ravi\n\nAll the best!",',
].join("\n");

export function NewDirectSendForm({
  senders,
  defaultSender,
}: {
  senders: { email: string; label: string }[];
  defaultSender: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fromEmail, setFromEmail] = useState(defaultSender);
  const [kind, setKind] = useState<Kind>("PERSONAL");

  const [csvName, setCsvName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<ColumnMap>({});
  const [csvError, setCsvError] = useState<string | null>(null);

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [attachMode, setAttachMode] = useState<AttachMode>("none");
  // Files attached to a person by hand, by CSV row number. Wins over the CSV
  // column and over automatic matching; [] means "no file for this person".
  const [rowFiles, setRowFiles] = useState<Record<number, string[]>>({});

  const [onlyProblems, setOnlyProblems] = useState(false);
  const [skipProblems, setSkipProblems] = useState(false);
  const [previewRow, setPreviewRow] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const csvRows: DirectRow[] = useMemo(() => (records.length ? toRows(records, map) : []), [records, map]);
  const fileNames = files.map((f) => f.file.name);
  const fileKey = fileNames.join("|");
  // What each person actually gets, after the attachment choice is applied.
  const rows: DirectRow[] = useMemo(
    () =>
      csvRows.map((r) => {
        if (attachMode !== "per_person") return { ...r, attachmentNames: [] };
        const manual = rowFiles[r.rowNumber];
        if (manual) return { ...r, attachmentNames: manual };
        if (r.attachmentNames.length) return r;
        return { ...r, attachmentNames: matchFilesToPerson(r, fileNames) };
      }),
    [csvRows, attachMode, rowFiles, fileKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const issues = useMemo(() => checkRows(rows, fileNames), [rows, fileKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockedRows = rows.filter((r) => isBlocking(issues.get(r.rowNumber)));
  const readyRows = rows.filter((r) => !isBlocking(issues.get(r.rowNumber)));
  const warnRows = rows.filter((r) => issues.has(r.rowNumber) && !isBlocking(issues.get(r.rowNumber)));
  const missingColumns = REQUIRED.filter((r) => !map[r]);

  const shown = (onlyProblems ? rows.filter((r) => issues.has(r.rowNumber)) : rows).slice(0, 200);
  const current = rows.find((r) => r.rowNumber === previewRow) ?? rows[0];

  async function loadCsv(file: File) {
    setCsvError(null);
    if (file.size > DIRECT_SEND_LIMITS.payloadBytes) {
      setCsvError("The CSV is larger than 4 MB. Split it into smaller files.");
      return;
    }
    const text = (await file.text()).replace(/^﻿/, "");
    const res = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    const hs = (res.meta.fields ?? []).filter(Boolean);
    if (hs.length === 0 || res.data.length === 0) {
      setCsvError("This CSV has no header row or no data rows.");
      return;
    }
    if (res.data.length > DIRECT_SEND_LIMITS.rows) {
      setCsvError(`This CSV has ${res.data.length.toLocaleString()} rows — the limit is ${DIRECT_SEND_LIMITS.rows.toLocaleString()} per batch.`);
      return;
    }
    setCsvName(file.name);
    setHeaders(hs);
    setRecords(res.data);
    const detected = detectColumns(hs);
    setMap(detected);
    setRowFiles({});
    if (detected.attachment) setAttachMode("per_person");
    setPreviewRow(1);
    if (!name) setName(file.name.replace(/\.csv$/i, ""));
  }

  /** Add files (same name replaces). Returns the names that were accepted. */
  function addFiles(list: FileList | File[]): string[] {
    setFileError(null);
    const next = [...files];
    const tooBig: string[] = [];
    const accepted: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > DIRECT_SEND_LIMITS.fileBytes) {
        tooBig.push(f.name);
        continue;
      }
      const i = next.findIndex((x) => x.file.name.toLowerCase() === f.name.toLowerCase());
      if (i >= 0) next[i] = { file: f, forAll: next[i]!.forAll };
      else next.push({ file: f, forAll: false });
      accepted.push(f.name);
    }
    setFiles(next);
    if (tooBig.length) setFileError(`Larger than 4 MB, not added: ${tooBig.join(", ")}. Compress or split them first.`);
    return accepted;
  }

  function removeFile(fileName: string) {
    setFiles((all) => all.filter((x) => x.file.name !== fileName));
    setRowFiles((rf) =>
      Object.fromEntries(Object.entries(rf).map(([k, v]) => [k, v.filter((n) => n !== fileName)])),
    );
  }

  /** Attach picked files to one person: keeps their files that exist, drops the missing names. */
  function attachToRow(rowNumber: number, picked: File[]) {
    const accepted = addFiles(picked);
    if (!accepted.length) return;
    const row = rows.find((r) => r.rowNumber === rowNumber);
    const keep = (row?.attachmentNames ?? []).filter((n) => fileNames.some((f) => fileMatches(n, f)));
    setRowFiles((rf) => ({ ...rf, [rowNumber]: Array.from(new Set([...keep, ...accepted])) }));
  }

  function detachFromRow(rowNumber: number, name: string) {
    const row = rows.find((r) => r.rowNumber === rowNumber);
    setRowFiles((rf) => ({ ...rf, [rowNumber]: (row?.attachmentNames ?? []).filter((n) => n !== name) }));
  }

  async function save() {
    setSaveError(null);
    const toSend = skipProblems ? readyRows : rows;
    if (!skipProblems && blockedRows.length) {
      setSaveError(`${blockedRows.length} row(s) have problems — fix the CSV, or tick "Skip rows with problems".`);
      return;
    }
    const sendFiles = attachMode === "none" ? [] : files;
    const payload = JSON.stringify({ name, kind, fromEmail, fileNames: sendFiles.map((f) => f.file.name), rows: toSend });
    if (payload.length > DIRECT_SEND_LIMITS.payloadBytes) {
      setSaveError("This batch is too large to upload at once (over 4 MB of text). Split the CSV into smaller files.");
      return;
    }
    setSaving(true);
    try {
      setProgress("Saving rows…");
      const res = await createDirectSend(payload);
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      for (let i = 0; i < sendFiles.length; i++) {
        const f = sendFiles[i]!;
        setProgress(`Uploading file ${i + 1} of ${sendFiles.length}: ${f.file.name}`);
        const fd = new FormData();
        fd.set("id", res.id);
        fd.set("file", f.file);
        fd.set("forAll", attachMode === "same" || f.forAll ? "1" : "0");
        const up = await uploadDirectSendAttachment(fd);
        if (!up.ok) {
          // The batch exists; the review page lets them re-upload the file.
          setSaveError(`${up.error} You can re-upload it on the next screen.`);
          router.push(`/marketing/personal/${res.id}`);
          return;
        }
      }
      setProgress("Done — opening review…");
      router.push(`/marketing/personal/${res.id}`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sampleHref = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`, []);

  return (
    <div className="space-y-5 pb-28">
      {/* 1. Details */}
      <Step n={1} title="Batch details">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Batch name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Offer letters — October" maxLength={200} />
          </div>
          <div>
            <Label>Send from</Label>
            {senders.length ? (
              <Select value={fromEmail} onChange={(e) => setFromEmail(e.target.value)}>
                {senders.map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.label}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-destructive">No verified sender. Add one in Settings → Senders.</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <KindCard
            active={kind === "PERSONAL"}
            onClick={() => setKind("PERSONAL")}
            icon={Mail}
            title="Personal (one-to-one)"
            hint="Offer letters, certificates, interview mails. No unsubscribe link."
          />
          <KindCard
            active={kind === "MARKETING"}
            onClick={() => setKind("MARKETING")}
            icon={Megaphone}
            title="Promotional"
            hint="Adds an unsubscribe link and skips people who unsubscribed from marketing."
          />
        </div>
      </Step>

      {/* 2. CSV */}
      <Step
        n={2}
        title="Upload the CSV"
        hint="One row per email. Use {{name}} or any column name, like {{college}}, inside the subject or body."
        right={
          <a href={sampleHref} download="personal-mails-sample.csv" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-300">
            <Download className="h-3.5 w-3.5" /> Sample CSV
          </a>
        }
      >
        <DropZone
          accept=".csv,text/csv"
          icon={FileSpreadsheet}
          title={csvName ? `${csvName} · ${records.length.toLocaleString()} rows` : "Drop your CSV here, or click to choose"}
          hint={csvName ? "Drop another file to replace it." : "Columns: email, name, subject, body, attachment (optional)"}
          onFiles={(fs) => fs[0] && loadCsv(fs[0])}
          done={Boolean(csvName)}
        />
        {csvError && <p className="mt-2 text-sm text-destructive">{csvError}</p>}

        {headers.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Which column is which?</div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((role) => (
                <div key={role}>
                  <Label>
                    {ROLE_LABELS[role]}
                    {REQUIRED.includes(role) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={map[role] ?? ""}
                    onChange={(e) => setMap((m) => ({ ...m, [role]: e.target.value || undefined }))}
                    className={cn(REQUIRED.includes(role) && !map[role] && "border-destructive")}
                  >
                    <option value="">{REQUIRED.includes(role) ? "— choose —" : "— none —"}</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      </Step>

      {/* 3. Attachments */}
      <Step n={3} title="Attachments" hint="Optional. Pick how files should go out — you can change it any time.">
        <AttachmentsStep
          mode={attachMode}
          onMode={setAttachMode}
          files={files}
          rows={rows}
          hasCsv={rows.length > 0 && missingColumns.length === 0}
          hasColumn={Boolean(map.attachment)}
          fileError={fileError}
          onAdd={addFiles}
          onRemove={removeFile}
          onToggleAll={(fileName, forAll) =>
            setFiles((all) => all.map((x) => (x.file.name === fileName ? { ...x, forAll } : x)))
          }
          onAttach={attachToRow}
          onDetach={detachFromRow}
        />
      </Step>

      {/* 4. Check */}
      {rows.length > 0 && missingColumns.length === 0 && (
        <Step n={4} title="Check every email">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Pill tone="success">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {readyRows.length.toLocaleString()} ready
            </Pill>
            {blockedRows.length > 0 && (
              <Pill tone="danger">
                <AlertTriangle className="mr-1 h-3.5 w-3.5" /> {blockedRows.length.toLocaleString()} can&apos;t be sent
              </Pill>
            )}
            {warnRows.length > 0 && <Pill tone="warning">{warnRows.length} duplicate email(s)</Pill>}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Show only rows with problems
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="max-h-[520px] overflow-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-muted-foreground dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">To</th>
                    <th className="px-3 py-2 text-left">Subject</th>
                    <th className="px-3 py-2 text-left">Files</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const iss = issues.get(r.rowNumber) ?? [];
                    const blocking = isBlocking(iss);
                    return (
                      <tr
                        key={r.rowNumber}
                        onClick={() => setPreviewRow(r.rowNumber)}
                        className={cn(
                          "cursor-pointer border-t border-border hover:bg-slate-50 dark:hover:bg-slate-800/50",
                          current?.rowNumber === r.rowNumber && "bg-emerald-50/70 dark:bg-emerald-950/30",
                        )}
                      >
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.rowNumber}</td>
                        <td className="max-w-[200px] truncate px-3 py-1.5">
                          <div className="truncate font-medium">{r.name || r.email || "—"}</div>
                          {r.name && <div className="truncate text-xs text-muted-foreground">{r.email}</div>}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-1.5">
                          {r.subject ? fillVariables(r.subject, r.variables, false) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs">
                          <FileCount row={r} files={files} mode={attachMode} />
                        </td>
                        <td className="px-3 py-1.5">
                          {iss.length === 0 ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-300">Ready</span>
                          ) : (
                            <span className={cn("text-xs", blocking ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")}>
                              {iss.map((i) => ISSUE_LABELS[i]).join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(onlyProblems ? issues.size : rows.length) > 200 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Showing the first 200.</p>
              )}
            </div>

            {current && (
              <RowPreview
                row={current}
                files={attachMode === "none" ? [] : files.map((f) => ({ ...f, forAll: attachMode === "same" || f.forAll }))}
                fromEmail={fromEmail}
                kind={kind}
              />
            )}
          </div>
        </Step>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-white/90 backdrop-blur dark:bg-slate-950/90 md:left-[var(--sidebar-w,15rem)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="text-sm">
            {progress && saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {progress}
              </span>
            ) : rows.length === 0 ? (
              <span className="text-muted-foreground">Upload a CSV to start.</span>
            ) : missingColumns.length ? (
              <span className="text-destructive">Choose the {missingColumns.map((c) => ROLE_LABELS[c]).join(", ")} column.</span>
            ) : (
              <span>
                <b>{(skipProblems ? readyRows.length : rows.length).toLocaleString()}</b> emails
                {attachMode !== "none" && files.length > 0 && ` · ${files.length} file${files.length === 1 ? "" : "s"}`}
                {blockedRows.length > 0 && (
                  <label className="ml-3 inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={skipProblems} onChange={(e) => setSkipProblems(e.target.checked)} />
                    Skip {blockedRows.length} row(s) with problems
                  </label>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saveError && <span className="max-w-md text-sm text-destructive">{saveError}</span>}
            <Button as="a" variant="secondary" href="/marketing/personal">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={
                saving ||
                !name.trim() ||
                !fromEmail ||
                rows.length === 0 ||
                missingColumns.length > 0 ||
                (!skipProblems && blockedRows.length > 0) ||
                (skipProblems && readyRows.length === 0)
              }
            >
              {saving ? "Saving…" : "Save & review →"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowPreview({ row, files, fromEmail, kind }: { row: DirectRow; files: LocalFile[]; fromEmail: string; kind: Kind }) {
  const email = buildRowEmail(row);
  const rowFiles = files.filter(
    (f) => f.forAll || row.attachmentNames.some((n) => fileMatches(n, f.file.name)),
  );
  const missing = row.attachmentNames.filter((n) => !files.some((f) => fileMatches(n, f.file.name)));
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-white">
      <div className="space-y-1 border-b border-border/60 bg-slate-50 px-4 py-3 text-xs dark:bg-slate-800/40">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview · row {row.rowNumber}</div>
        <div>
          <span className="text-muted-foreground">From:</span> {fromEmail}
        </div>
        <div>
          <span className="text-muted-foreground">To:</span> {row.email || "—"}
        </div>
        <div className="text-sm font-semibold">{email.subject || "(no subject)"}</div>
      </div>
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={email.html}
        className="h-80 w-full bg-white"
      />
      {(rowFiles.length > 0 || missing.length > 0) && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-2">
          {rowFiles.map((f) => (
            <span key={f.file.name} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
              <Paperclip className="h-3 w-3" /> {f.file.name}
            </span>
          ))}
          {missing.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200">
              <AlertTriangle className="h-3 w-3" /> {n} (not uploaded)
            </span>
          ))}
        </div>
      )}
      {kind === "MARKETING" && (
        <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">An unsubscribe link is added at the bottom when sent.</p>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  hint,
  right,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">
          {n}
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-medium text-muted-foreground">{children}</div>;
}

function Pill({ tone, children }: { tone: "success" | "danger" | "warning"; children: React.ReactNode }) {
  const tones = {
    success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    danger: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition",
        active ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-border/70 hover:border-emerald-300",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4", active ? "text-emerald-600" : "text-muted-foreground")} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function DropZone({
  title,
  hint,
  icon: Icon,
  onFiles,
  accept,
  multiple,
  done,
}: {
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  done?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-5 py-5 transition",
        over
          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30"
          : done
            ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20"
            : "border-border hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/40",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
        {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Upload className="ml-auto h-4 w-4 text-muted-foreground" />
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

const MODES: { value: AttachMode; title: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "none", title: "No attachments", hint: "Just the email text.", icon: FileX2 },
  { value: "same", title: "Same file for everyone", hint: "e.g. a brochure or event schedule.", icon: Files },
  { value: "per_person", title: "A different file for each person", hint: "e.g. offer letters, certificates.", icon: UserRoundCheck },
];

function fileKind(name: string): { icon: React.ComponentType<{ className?: string }>; tone: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { icon: FileText, tone: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return { icon: FileImage, tone: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300" };
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return { icon: FileSpreadsheet, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300" };
  }
  return { icon: FileIcon, tone: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

type PersonState = "has" | "missing" | "none";

function AttachmentsStep({
  mode,
  onMode,
  files,
  rows,
  hasCsv,
  hasColumn,
  fileError,
  onAdd,
  onRemove,
  onToggleAll,
  onAttach,
  onDetach,
}: {
  mode: AttachMode;
  onMode: (m: AttachMode) => void;
  files: LocalFile[];
  rows: DirectRow[];
  hasCsv: boolean;
  hasColumn: boolean;
  fileError: string | null;
  onAdd: (files: File[]) => string[];
  onRemove: (name: string) => void;
  onToggleAll: (name: string, forAll: boolean) => void;
  onAttach: (rowNumber: number, files: File[]) => void;
  onDetach: (rowNumber: number, name: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | PersonState>("all");
  const picker = useRef<HTMLInputElement>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);

  const uploaded = (n: string) => files.find((f) => fileMatches(n, f.file.name));
  const everyone = files.filter((f) => f.forAll);
  const people = rows.map((r) => {
    const got = r.attachmentNames.map(uploaded).filter((f): f is LocalFile => Boolean(f));
    const missing = r.attachmentNames.filter((n) => !uploaded(n));
    const state: PersonState = missing.length ? "missing" : got.length || everyone.length ? "has" : "none";
    return { row: r, got, missing, state };
  });
  const count = (s: PersonState) => people.filter((p) => p.state === s).length;
  const matching = filter === "all" ? people : people.filter((p) => p.state === filter);
  const shown = matching.slice(0, 100);
  const recipientsOf = (fileName: string) => rows.filter((r) => r.attachmentNames.some((n) => fileMatches(n, fileName)));
  const totalBytes = files.reduce((n, f) => n + f.file.size, 0);

  return (
    <div className="space-y-4">
      {/* How should files go out? */}
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onMode(m.value)}
            aria-pressed={mode === m.value}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition",
              mode === m.value ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-950/40" : "border-border hover:border-brand-300",
            )}
          >
            <m.icon className={cn("mt-0.5 h-4 w-4 shrink-0", mode === m.value ? "text-brand-600" : "text-muted-foreground")} />
            <span>
              <span className="block text-sm font-medium">{m.title}</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === "same" && (
        <>
          <DropZone
            multiple
            icon={Paperclip}
            title="Drop files here, or click to choose"
            hint="Every email gets all of these files · max 4 MB each"
            onFiles={onAdd}
          />
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          {files.length > 0 && (
            <>
              <FileCards files={files} onRemove={onRemove} describe={() => <span className="text-brand-700 dark:text-brand-300">Everyone</span>} />
              <p className="text-xs text-muted-foreground">
                Each email will carry {files.length} file{files.length === 1 ? "" : "s"} ({formatBytes(totalBytes)}).
              </p>
            </>
          )}
        </>
      )}

      {mode === "per_person" && (
        <>
          <div className="flex gap-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">Drop all the files at once — they are matched to people automatically:</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {hasColumn && <li>by the file name in your CSV&apos;s attachment column (the extension is optional);</li>}
                <li>
                  {hasColumn ? "otherwise " : ""}by a file named after the person —{" "}
                  <code className="rounded bg-white/70 px-1 dark:bg-black/20">asha@gmail.com.pdf</code> or{" "}
                  <code className="rounded bg-white/70 px-1 dark:bg-black/20">Asha Rao.pdf</code>;
                </li>
                <li>
                  or use <b>Attach file</b> next to anyone below — then the file name doesn&apos;t matter.
                </li>
              </ul>
            </div>
          </div>

          <DropZone
            multiple
            icon={Paperclip}
            title="Drop all the files here, or click to choose"
            hint="PDF, images, documents · max 4 MB each"
            onFiles={onAdd}
          />
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}

          {!hasCsv ? (
            <p className="text-sm text-muted-foreground">Upload the CSV above to see who gets which file.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
                {(
                  [
                    ["all", `Everyone · ${people.length}`],
                    ["has", `Have a file · ${count("has")}`],
                    ["missing", `File not uploaded · ${count("missing")}`],
                    ["none", `No file · ${count("none")}`],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFilter(k)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs transition",
                      filter === k
                        ? k === "missing"
                          ? "bg-red-600 font-medium text-white"
                          : "bg-foreground font-medium text-background"
                        : k === "missing" && count("missing")
                          ? "text-red-700 hover:bg-red-50 dark:text-red-300"
                          : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {shown.map(({ row, got, missing, state }) => (
                  <li key={row.rowNumber} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        state === "has" ? "bg-brand-500" : state === "missing" ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600",
                      )}
                    />
                    <span className="w-48 min-w-0 shrink-0">
                      <span className="block truncate text-sm font-medium">{row.name || row.email}</span>
                      {row.name && <span className="block truncate text-xs text-muted-foreground">{row.email}</span>}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {got.map((f) => (
                        <FileChip key={f.file.name} name={f.file.name} onRemove={() => onDetach(row.rowNumber, f.file.name)} />
                      ))}
                      {missing.map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
                        >
                          <AlertTriangle className="h-3 w-3" /> {n} — not uploaded
                        </span>
                      ))}
                      {state === "none" && <span className="text-xs text-muted-foreground">No file</span>}
                      {state === "has" && got.length === 0 && (
                        <span className="text-xs text-muted-foreground">Only the files sent to everyone</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPickFor(row.rowNumber);
                        picker.current?.click();
                      }}
                      className={buttonClasses(state === "missing" ? "primary" : "secondary", "sm")}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {state === "missing" ? "Upload file" : got.length ? "Add file" : "Attach file"}
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody here.</li>}
              </ul>
              {matching.length > 100 && (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing the first 100 of {matching.length}.</p>
              )}
              <input
                ref={picker}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (pickFor !== null && e.target.files?.length) onAttach(pickFor, Array.from(e.target.files));
                  e.target.value = "";
                  setPickFor(null);
                }}
              />
            </div>
          )}

          {files.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Uploaded files</div>
              <FileCards
                files={files}
                onRemove={onRemove}
                onToggleAll={onToggleAll}
                describe={(f) => {
                  if (f.forAll) return <span className="text-brand-700 dark:text-brand-300">Everyone</span>;
                  const to = recipientsOf(f.file.name);
                  if (!to.length) return <span className="text-amber-700 dark:text-amber-300">Not matched to anyone</span>;
                  const names = to.map((r) => r.name || r.email);
                  return (
                    <span title={names.join(", ")}>
                      → {names.slice(0, 2).join(", ")}
                      {names.length > 2 ? ` +${names.length - 2} more` : ""}
                    </span>
                  );
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FileChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  const k = fileKind(name);
  return (
    <span className="inline-flex max-w-[260px] items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs ring-1 ring-inset ring-border">
      <k.icon className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate">{name}</span>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-600" aria-label={`Remove ${name}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FileCards({
  files,
  onRemove,
  onToggleAll,
  describe,
}: {
  files: LocalFile[];
  onRemove: (name: string) => void;
  onToggleAll?: (name: string, forAll: boolean) => void;
  describe: (f: LocalFile) => React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {files.map((f) => {
        const k = fileKind(f.file.name);
        return (
          <div key={f.file.name} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", k.tone)}>
              <k.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={f.file.name}>
                {f.file.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {formatBytes(f.file.size)} · {describe(f)}
              </div>
              {onToggleAll && (
                <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={f.forAll} onChange={(e) => onToggleAll(f.file.name, e.target.checked)} />
                  Also send to everyone
                </label>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(f.file.name)}
              className="self-start rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
              title="Remove file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Files column of the check table. */
function FileCount({ row, files, mode }: { row: DirectRow; files: LocalFile[]; mode: AttachMode }) {
  if (mode === "none") return <span className="text-muted-foreground">—</span>;
  const shared = files.filter((f) => mode === "same" || f.forAll).length;
  const own = row.attachmentNames.filter((n) => files.some((f) => fileMatches(n, f.file.name))).length;
  const missing = row.attachmentNames.length - own;
  const total = shared + own;
  if (missing) return <span className="text-red-700 dark:text-red-300">{missing} missing</span>;
  if (!total) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Paperclip className="h-3 w-3" /> {total}
    </span>
  );
}
