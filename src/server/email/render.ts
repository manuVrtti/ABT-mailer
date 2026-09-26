/**
 * Personalization renderer for BOTH marketing and transactional emails.
 *
 * Syntax (both native and Brevo-style are accepted):
 *   {{first_name}}
 *   {{first_name | default: "there"}}
 *   {{ contact.FIRSTNAME | default : "there" }}
 *
 * Rules:
 *   * Unknown tokens are left as-is when strict=false (marketing fallback friendly),
 *     but throw a MissingVariableError when strict=true (transactional safety).
 *   * Values are HTML-escaped by default. Prefix a variable with `!` to skip
 *     escaping — reserved for internal use only, never accepted from user input.
 *   * Whitespace around the pipe/name/colon is tolerated.
 */

export class MissingVariableError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(`Missing required variable: ${variable}`);
    this.variable = variable;
    this.name = "MissingVariableError";
  }
}

// Quotes around the default may arrive HTML-encoded or "smart" when the
// template was pasted from a rich editor.
const Q_OPEN = `(?:"|&quot;|&#34;|'|&#39;|“|‘)`;
const Q_CLOSE = `(?:"|&quot;|&#34;|'|&#39;|”|’)`;
const TOKEN_RE = new RegExp(
  `\\{\\{\\s*(!?)\\s*([a-zA-Z_][a-zA-Z0-9_.]*)\\s*(?:\\|\\s*default\\s*:\\s*${Q_OPEN}(.*?)${Q_CLOSE}\\s*)?\\}\\}`,
  "g",
);

// Brevo/Mailchimp attribute names → our contact variable keys.
const ALIASES: Record<string, string> = {
  firstname: "first_name",
  fname: "first_name",
  prenom: "first_name",
  lastname: "last_name",
  lname: "last_name",
  nom: "last_name",
  name: "first_name",
};

function resolveVar(vars: Record<string, string | number | null | undefined>, name: string) {
  if (name in vars) return vars[name];
  const key = name.replace(/^(contact|params|attributes)\./i, "");
  if (key in vars) return vars[key];
  const lower = key.toLowerCase();
  if (lower in vars) return vars[lower];
  const alias = ALIASES[lower.replace(/_/g, "")];
  return alias ? vars[alias] : undefined;
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

export interface RenderOptions {
  strict?: boolean;
  /** If true, output is treated as HTML and scrubbed of executable content. */
  sanitize?: boolean;
}

export function renderTemplate(
  source: string,
  vars: Record<string, string | number | null | undefined>,
  options: RenderOptions = {},
): string {
  const strict = options.strict ?? false;
  const sanitize = options.sanitize ?? false;

  const out = source.replace(TOKEN_RE, (_match, bang: string, name: string, fallback: string | undefined) => {
    const raw = resolveVar(vars, name);
    const value = raw === undefined || raw === null || raw === "" ? fallback : String(raw);
    if (value === undefined) {
      if (strict) throw new MissingVariableError(name);
      return `{{${name}}}`; // leave the token untouched — safer than an empty gap
    }
    return bang === "!" ? value : escapeHtml(value);
  });

  if (!sanitize) return out;
  return sanitizeHtml(out);
}

/**
 * Remove only what can execute. Templates are authored by authenticated
 * admins/marketers and substituted values are already escaped, so a strict
 * allowlist sanitizer bought no real safety while stripping <link> fonts,
 * <head> styles and many CSS properties — which is why sent emails didn't
 * match the designed template.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');
}

/** Extract the set of variable names referenced in a template body. */
export function extractVariables(source: string): string[] {
  const set = new Set<string>();
  for (const m of source.matchAll(TOKEN_RE)) {
    if (m[2]) set.add(m[2]);
  }
  return [...set];
}

/** Ensure every declared required variable has a value. Used before enqueue. */
export function assertRequiredVariables(
  required: string[],
  vars: Record<string, string | number | null | undefined>,
): void {
  for (const name of required) {
    const v = resolveVar(vars, name);
    if (v === undefined || v === null || v === "") throw new MissingVariableError(name);
  }
}
