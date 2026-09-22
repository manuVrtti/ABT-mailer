/**
 * Rewrite every http(s) link in a rendered HTML body to carry UTM parameters
 * that identify the campaign. Applied at fan-out time so every recipient's
 * email has the same attribution parameters.
 *
 * The parser is intentionally simple: it targets href="..." and href='...'
 * inside anchor tags. It leaves anchor-relative fragments (#) and mailto/tel
 * links alone. Existing utm_* parameters are preserved (the campaign's tag
 * only fills in blanks).
 */

interface UtmParams {
  source?: string;
  medium?: string;
  campaign: string;
  content?: string;
  term?: string;
}

const HREF_RE = /(<a\b[^>]*\shref=)("([^"]*)"|'([^']*)')/gi;

function applyUtm(url: string, utm: UtmParams): string {
  try {
    const u = new URL(url);
    // Only add UTM to http/https absolute URLs. Skip mailto:, tel:, javascript:.
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    const params = u.searchParams;
    if (utm.source && !params.has("utm_source")) params.set("utm_source", utm.source);
    if (utm.medium && !params.has("utm_medium")) params.set("utm_medium", utm.medium);
    if (utm.campaign && !params.has("utm_campaign")) params.set("utm_campaign", utm.campaign);
    if (utm.content && !params.has("utm_content")) params.set("utm_content", utm.content);
    if (utm.term && !params.has("utm_term")) params.set("utm_term", utm.term);
    return u.toString();
  } catch {
    // Non-absolute URL (e.g. "/path") — pass through unchanged.
    return url;
  }
}

export function addUtmToHtml(html: string, utm: UtmParams): string {
  return html.replace(HREF_RE, (_full, prefix: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
    const raw = dq ?? sq ?? "";
    const quote = dq !== undefined ? '"' : "'";
    if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("mailto:") || raw.toLowerCase().startsWith("tel:")) {
      return `${prefix}${quote}${raw}${quote}`;
    }
    const rewritten = applyUtm(raw, utm);
    return `${prefix}${quote}${rewritten}${quote}`;
  });
}
