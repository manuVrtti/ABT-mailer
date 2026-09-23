/**
 * Personalization renderer for BOTH marketing and transactional emails.
 *
 * Syntax:
 *   {{first_name}}
 *   {{first_name | default: "there"}}
 *
 * Rules:
 *   * Unknown tokens are left as-is when strict=false (marketing fallback friendly),
 *     but throw a MissingVariableError when strict=true (transactional safety).
 *   * Values are HTML-escaped by default. Prefix a variable with `!` to skip
 *     escaping — reserved for internal use only, never accepted from user input.
 *   * Whitespace around the pipe/name is tolerated.
 *
 * We deliberately do NOT use a full template engine like Handlebars for the
 * email body — the surface must be tiny and safe.
 */

export class MissingVariableError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(`Missing required variable: ${variable}`);
    this.variable = variable;
    this.name = "MissingVariableError";
  }
}

const TOKEN_RE = /\{\{\s*(!?)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|\s*default:\s*"([^"]*)"\s*)?\}\}/g;

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
  /** If true, output is treated as HTML and sanitized after substitution. */
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
    const raw = vars[name];
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
 * HTML sanitizer used for personalized email bodies. Uses `sanitize-html`
 * (pure CJS, no ESM CSS-parser transitive dep) so it works cleanly in
 * Vercel's Node 20 runtime. Was previously DOMPurify, which pulled in
 * `@csstools/css-calc` (ESM-only) and broke at runtime.
 */
import sanitize from "sanitize-html";

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: sanitize.defaults.allowedTags.concat([
    "img",
    "h1",
    "h2",
    "style",
    "font",
    "center",
    "hr",
  ]),
  allowedAttributes: {
    ...sanitize.defaults.allowedAttributes,
    "*": ["style", "class", "id", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing"],
    a: ["href", "name", "target", "rel", "style", "class"],
    img: ["src", "srcset", "alt", "title", "width", "height", "style", "class"],
    table: ["style", "class", "border", "cellpadding", "cellspacing", "align", "bgcolor", "width"],
    td: ["style", "class", "align", "valign", "width", "height", "bgcolor", "colspan", "rowspan"],
    th: ["style", "class", "align", "valign", "width", "height", "bgcolor", "colspan", "rowspan"],
  },
  // Allow inline styles — email HTML lives on inline CSS.
  allowedStyles: {
    "*": {
      color: [/.*/],
      "background-color": [/.*/],
      "background": [/.*/],
      "font-family": [/.*/],
      "font-size": [/.*/],
      "font-weight": [/.*/],
      "font-style": [/.*/],
      "text-align": [/.*/],
      "text-decoration": [/.*/],
      "line-height": [/.*/],
      padding: [/.*/],
      "padding-top": [/.*/],
      "padding-right": [/.*/],
      "padding-bottom": [/.*/],
      "padding-left": [/.*/],
      margin: [/.*/],
      "margin-top": [/.*/],
      "margin-right": [/.*/],
      "margin-bottom": [/.*/],
      "margin-left": [/.*/],
      border: [/.*/],
      "border-top": [/.*/],
      "border-right": [/.*/],
      "border-bottom": [/.*/],
      "border-left": [/.*/],
      "border-radius": [/.*/],
      "border-collapse": [/.*/],
      width: [/.*/],
      "max-width": [/.*/],
      "min-width": [/.*/],
      height: [/.*/],
      "max-height": [/.*/],
      "min-height": [/.*/],
      display: [/.*/],
      "vertical-align": [/.*/],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
};

export function sanitizeHtml(html: string): string {
  return sanitize(html, SANITIZE_OPTIONS);
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
    const v = vars[name];
    if (v === undefined || v === null || v === "") throw new MissingVariableError(name);
  }
}
