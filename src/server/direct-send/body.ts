/**
 * Personal mails — pure helpers shared by the upload screen (browser) and the
 * server: CSV column detection, row checks, and turning a row's body into the
 * email's HTML and text parts. No server-only imports in this file.
 */

export const DIRECT_SEND_LIMITS = {
  rows: 5000,
  /** One upload request on Vercel is capped at ~4.5 MB. */
  fileBytes: 4 * 1024 * 1024,
  /** The rows JSON sent when saving a batch, same cap. */
  payloadBytes: 4 * 1024 * 1024,
  /** SES takes 40 MB per message; base64 adds ~33%. */
  messageBytes: 28 * 1024 * 1024,
  subjectChars: 300,
  bodyChars: 100_000,
} as const;

export type ColumnRole = "email" | "name" | "subject" | "body" | "attachment";
export type ColumnMap = Partial<Record<ColumnRole, string>>;

const ROLE_ALIASES: Record<ColumnRole, string[]> = {
  email: ["email", "e-mail", "email id", "emailid", "email address", "mail id", "to", "recipient"],
  name: ["name", "full name", "fullname", "first name", "firstname", "candidate name", "student name"],
  subject: ["subject", "subject line", "title", "mail subject", "email subject"],
  body: ["body", "message", "content", "text", "mail body", "email body", "letter"],
  attachment: ["attachment", "attachments", "file", "files", "attachment name", "attachment names", "document"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\s]+/g, " ");

/** Guess which CSV header holds each part. Exact alias first, then "contains". */
export function detectColumns(headers: string[]): ColumnMap {
  const out: ColumnMap = {};
  const used = new Set<string>();
  const roles: ColumnRole[] = ["email", "subject", "body", "attachment", "name"];
  for (const pass of ["exact", "contains"] as const) {
    for (const role of roles) {
      if (out[role]) continue;
      const hit = headers.find((h) => {
        if (used.has(h)) return false;
        const n = norm(h);
        // Short aliases ("to") only match exactly — "photo" is not an email column.
        return ROLE_ALIASES[role].some((a) => (pass === "exact" ? n === a : a.length >= 5 && n.includes(a)));
      });
      if (hit) {
        out[role] = hit;
        used.add(hit);
      }
    }
  }
  return out;
}

/** "Offer Letter.pdf; brochure.pdf" → ["Offer Letter.pdf", "brochure.pdf"]. */
export function parseAttachmentNames(cell: string | undefined | null): string[] {
  return Array.from(
    new Set(
      String(cell ?? "")
        .split(/[;|\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

const EXT_RE = /\.[a-z0-9]{1,8}$/i;
const fileKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Does a name from the CSV's attachment column refer to this uploaded file?
 * Case-insensitive; a name written without an extension matches the file of
 * that name with any extension ("Offer Letter" → "offer letter.pdf").
 */
export function fileMatches(csvName: string, fileName: string): boolean {
  const want = fileKey(csvName);
  const have = fileKey(fileName);
  if (want === have) return true;
  return !EXT_RE.test(want) && have.replace(EXT_RE, "") === want;
}

/** The uploaded files a CSV name refers to (usually one). */
export function findFiles<T>(csvName: string, files: T[], nameOf: (f: T) => string): T[] {
  return files.filter((f) => fileMatches(csvName, nameOf(f)));
}

/** CSV header → {{variable}} name: "First Name" → "first_name". */
export function variableKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface DirectRow {
  rowNumber: number;
  email: string;
  name: string;
  subject: string;
  body: string;
  attachmentNames: string[];
  variables: Record<string, string>;
}

/** Map raw CSV records to rows using the chosen columns. */
export function toRows(records: Record<string, string>[], map: ColumnMap): DirectRow[] {
  return records.map((r, i) => {
    const get = (role: ColumnRole) => (map[role] ? String(r[map[role]!] ?? "").trim() : "");
    const variables: Record<string, string> = {};
    for (const [h, v] of Object.entries(r)) {
      const key = variableKey(h);
      if (key) variables[key] = String(v ?? "").trim();
    }
    const email = get("email").toLowerCase();
    const name = get("name");
    variables.email = email;
    variables.name = name;
    return {
      rowNumber: i + 1,
      email,
      name,
      subject: get("subject"),
      // Keep the body's own line breaks; only trim the ends.
      body: map.body ? String(r[map.body] ?? "").replace(/^\s+|\s+$/g, "") : "",
      attachmentNames: parseAttachmentNames(map.attachment ? r[map.attachment] : ""),
      variables,
    };
  });
}

export type RowIssue = "invalid_email" | "no_subject" | "no_body" | "missing_file" | "duplicate_email" | "too_long";

/** Issues that stop a row from being sent. Duplicates are only a warning. */
export const BLOCKING_ISSUES: RowIssue[] = ["invalid_email", "no_subject", "no_body", "missing_file", "too_long"];

export const ISSUE_LABELS: Record<RowIssue, string> = {
  invalid_email: "Invalid email",
  no_subject: "No subject",
  no_body: "No body",
  missing_file: "Attachment not uploaded",
  duplicate_email: "Same email as another row",
  too_long: "Subject or body too long",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Problems per row. `fileNames` = uploaded attachment names, matched with
 * fileMatches (case-insensitive, extension optional).
 */
export function checkRows(rows: DirectRow[], fileNames: string[]): Map<number, RowIssue[]> {
  const hasFile = (n: string) => fileNames.some((f) => fileMatches(n, f));
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.email, (seen.get(r.email) ?? 0) + 1);
  const out = new Map<number, RowIssue[]>();
  for (const r of rows) {
    const issues: RowIssue[] = [];
    if (!EMAIL_RE.test(r.email) || r.email.length > 254) issues.push("invalid_email");
    if (!r.subject) issues.push("no_subject");
    if (!r.body) issues.push("no_body");
    if (r.subject.length > DIRECT_SEND_LIMITS.subjectChars || r.body.length > DIRECT_SEND_LIMITS.bodyChars) {
      issues.push("too_long");
    }
    if (r.attachmentNames.some((n) => !hasFile(n))) issues.push("missing_file");
    if (r.email && (seen.get(r.email) ?? 0) > 1) issues.push("duplicate_email");
    if (issues.length) out.set(r.rowNumber, issues);
  }
  return out;
}

export function isBlocking(issues: RowIssue[] | undefined): boolean {
  return Boolean(issues?.some((i) => BLOCKING_ISSUES.includes(i)));
}

// ---------------------------------------------------------------------------
// Body → email
// ---------------------------------------------------------------------------

const HTML_TAG_RE = /<\/?(p|div|br|table|tr|td|a|b|strong|i|em|u|ul|ol|li|h[1-6]|span|img|html|body|hr|font|center)\b[^>]*>/i;

/** The body is treated as HTML when it contains real HTML tags. */
export function looksLikeHtml(body: string): boolean {
  return HTML_TAG_RE.test(body);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Replace {{column}} tokens with this row's values. Unknown tokens stay as
 * written so a typo is visible in the preview rather than silently blank.
 */
export function fillVariables(text: string, vars: Record<string, string>, escape: boolean): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, key: string) => {
    const v = vars[key.toLowerCase()];
    if (v === undefined) return m;
    return escape ? escapeHtml(v) : v;
  });
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Plain text → HTML: paragraphs on blank lines, <br> on single breaks, links clickable. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para)
        .replace(URL_RE, (u) => `<a href="${u}" style="color:#047857">${u}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px">${html}</p>`;
    })
    .join("\n");
}

/** HTML → readable text, for the plain-text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * One row's email. Plain-text bodies are wrapped in a simple readable layout;
 * HTML bodies are used as written (the server sanitizes them before sending).
 */
export function buildRowEmail(row: { subject: string; body: string; variables: Record<string, string> }): BuiltEmail {
  const subject = fillVariables(row.subject, row.variables, false).replace(/[\r\n]+/g, " ").trim();
  if (looksLikeHtml(row.body)) {
    const html = fillVariables(row.body, row.variables, true);
    return { subject, html, text: htmlToText(html) };
  }
  const text = fillVariables(row.body, row.variables, false);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:640px">\n${plainTextToHtml(text)}\n</div>`;
  return { subject, html, text };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
