"use client";

import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Card, Button } from "@/components/ui";
import {
  detectColumns,
  extractContact,
  isHeaderless,
  FIELD_LABELS,
  type ColumnMapping,
  type ContactField,
  type ExtractedContact,
} from "@/lib/csv-columns";
import { importCsvToList, type ListImportResult } from "../actions";

type Preview = {
  file: File;
  header: string[];
  mapping: ColumnMapping;
  sample: ExtractedContact[];
  validCount: number;
  totalRows: number;
};

export function ImportCsvPanel({ listId }: { listId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();

  function reset() {
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Please choose a .csv file (in Excel/Sheets: File → Download → CSV).");
      return;
    }
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const rows = res.data.filter((r) => r.some((c) => c?.trim()));
        if (rows.length === 0) {
          setError("The CSV is empty.");
          return;
        }
        const headerless = isHeaderless(rows[0]!);
        const header = headerless ? [] : rows[0]!;
        const dataRows = headerless ? rows : rows.slice(1);
        const mapping = detectColumns(header, dataRows.slice(0, 50));
        if (mapping.email === undefined) {
          setError("Couldn't find an email column. Add a header named “email” and try again.");
          return;
        }
        const extracted = dataRows.map((r) => extractContact(r, mapping)).filter(Boolean) as ExtractedContact[];
        setPreview({
          file,
          header,
          mapping,
          sample: extracted.slice(0, 5),
          validCount: new Set(extracted.map((c) => c.email)).size,
          totalRows: dataRows.length,
        });
      },
      error: () => setError("Couldn't read that file."),
    });
  }

  function runImport() {
    if (!preview) return;
    const fd = new FormData();
    fd.set("listId", listId);
    fd.set("file", preview.file);
    start(async () => {
      const res = await importCsvToList(fd);
      setResult(res);
      if (res.ok) reset();
    });
  }

  const mappedFields = preview
    ? (Object.entries(preview.mapping) as [ContactField, number][]).sort((a, b) => a[1] - b[1])
    : [];

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-medium">Import contacts from CSV</div>
          <div className="text-[11px] text-muted-foreground">
            We detect the email and name columns automatically, create any new contacts, and add everyone to this list.
          </div>
        </div>
      </div>

      {!preview && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
              : "border-border hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800/40"
          }`}
        >
          <Upload className="h-6 w-6 text-emerald-600" />
          <div className="text-sm font-medium">Drop a CSV here, or click to choose</div>
          <div className="text-xs text-muted-foreground">
            Needs an email column. Name can be one “Name” column or separate First / Last name columns.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
            <div>
              <span className="font-medium">{preview.file.name}</span> ·{" "}
              <b className="tabular-nums">{preview.validCount.toLocaleString()}</b> contacts ready
              {preview.totalRows - preview.validCount > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {(preview.totalRows - preview.validCount).toLocaleString()} rows skipped (no valid email or duplicate)
                </span>
              )}
            </div>
            <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground" aria-label="Remove file">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Detected columns</div>
            <div className="flex flex-wrap gap-1.5">
              {mappedFields.map(([field, idx]) => (
                <span
                  key={field}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                >
                  {preview.header[idx] ? `“${preview.header[idx]}”` : `Column ${idx + 1}`} → {FIELD_LABELS[field]}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-muted-foreground dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">First name</th>
                  <th className="px-3 py-2 font-medium">Last name</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((c) => (
                  <tr key={c.email} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium">{c.email}</td>
                    <td className="px-3 py-2">{c.firstName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">{c.lastName ?? <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.mapping.firstName === undefined && preview.mapping.fullName === undefined && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              No name column found — emails will greet recipients with the default (e.g. “there”).
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={reset} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={runImport} disabled={pending}>
              {pending ? "Importing…" : `Import ${preview.validCount.toLocaleString()} contacts`}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {result &&
        (result.ok ? (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>{result.addedToList.toLocaleString()}</b> added to this list ·{" "}
              {result.created.toLocaleString()} new contacts · {result.updated.toLocaleString()} existing updated
              {result.alreadyInList > 0 && <> · {result.alreadyInList.toLocaleString()} were already in the list</>}
              {result.invalid > 0 && <> · {result.invalid.toLocaleString()} rows without a valid email skipped</>}
              {result.duplicates > 0 && <> · {result.duplicates.toLocaleString()} duplicate rows merged</>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.error}
          </div>
        ))}
    </Card>
  );
}
