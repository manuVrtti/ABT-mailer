/**
 * Brevo-style CSV column detection. Pure and dependency-free so the list
 * import panel can preview the mapping in the browser and the server action
 * applies the exact same mapping.
 */

export type ContactField = "email" | "firstName" | "lastName" | "fullName" | "phone" | "college" | "branch" | "year";

const HEADER_ALIASES: Record<ContactField, string[]> = {
  email: ["email", "emailaddress", "emailid", "mail", "mailid", "email1", "primaryemail", "workemail", "e-mail"],
  firstName: ["firstname", "fname", "first", "givenname", "prenom", "forename"],
  lastName: ["lastname", "lname", "last", "surname", "familyname", "nom"],
  fullName: ["name", "fullname", "contactname", "studentname", "candidatename", "participantname", "username", "displayname"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contactnumber", "whatsapp", "sms"],
  college: ["college", "collegename", "university", "institute", "institution", "school", "organisation", "organization", "company"],
  branch: ["branch", "department", "dept", "stream", "specialization", "specialisation", "course"],
  year: ["year", "currentyear", "studyyear", "batch", "graduationyear"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(v: string | undefined | null): boolean {
  return !!v && EMAIL_RE.test(v.trim());
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type ColumnMapping = Partial<Record<ContactField, number>>;

/**
 * Map header cells to contact fields. Falls back to sniffing the data rows
 * for an email-shaped column when no header matches (headerless files or
 * unusual header names).
 */
export function detectColumns(header: string[], sampleRows: string[][]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalized = header.map(norm);
  const fields = Object.keys(HEADER_ALIASES) as ContactField[];
  const taken = (i: number) => Object.values(mapping).includes(i);
  const exactAlias = new Set(Object.values(HEADER_ALIASES).flat());

  // Exact header matches first, for every field — otherwise a loose match can
  // steal another field's column ("Full Name" contains "lname").
  for (const field of fields) {
    const idx = normalized.findIndex((h, i) => !taken(i) && HEADER_ALIASES[field].includes(h));
    if (idx !== -1) mapping[field] = idx;
  }
  // Looser match: "Student Email ID", "Candidate First Name", ... Never on a
  // header that is exactly some other field's name.
  for (const field of fields) {
    if (mapping[field] !== undefined || field === "fullName") continue;
    const idx = normalized.findIndex(
      (h, i) => !taken(i) && !exactAlias.has(h) && HEADER_ALIASES[field].some((a) => a.length > 3 && h.includes(a)),
    );
    if (idx !== -1) mapping[field] = idx;
  }

  if (mapping.email === undefined) {
    const width = Math.max(header.length, ...sampleRows.map((r) => r.length));
    for (let i = 0; i < width; i++) {
      const hits = sampleRows.filter((r) => looksLikeEmail(r[i])).length;
      if (hits > 0 && hits >= Math.ceil(sampleRows.length / 2)) {
        mapping.email = i;
        break;
      }
    }
  }
  return mapping;
}

/** True when the first row is data rather than a header (it contains an email). */
export function isHeaderless(firstRow: string[]): boolean {
  return firstRow.some((c) => looksLikeEmail(c));
}

export type ExtractedContact = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  college?: string;
  branch?: string;
  year?: string;
};

function cell(row: string[], idx: number | undefined): string | undefined {
  if (idx === undefined) return undefined;
  const v = row[idx]?.trim();
  return v ? v : undefined;
}

export function extractContact(row: string[], mapping: ColumnMapping): ExtractedContact | null {
  const email = cell(row, mapping.email)?.toLowerCase();
  if (!email || !looksLikeEmail(email)) return null;

  let firstName = cell(row, mapping.firstName);
  let lastName = cell(row, mapping.lastName);
  const fullName = cell(row, mapping.fullName);
  if (fullName && !firstName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0];
    if (!lastName && parts.length > 1) lastName = parts.slice(1).join(" ");
  } else if (fullName && firstName && !lastName) {
    // First Name + Full Name columns: last name is what follows the first name.
    const rest = fullName.toLowerCase().startsWith(firstName.toLowerCase() + " ")
      ? fullName.slice(firstName.length).trim()
      : "";
    if (rest) lastName = rest;
  }

  return {
    email,
    firstName: firstName?.slice(0, 120),
    lastName: lastName?.slice(0, 120),
    phone: cell(row, mapping.phone)?.slice(0, 40),
    college: cell(row, mapping.college)?.slice(0, 200),
    branch: cell(row, mapping.branch)?.slice(0, 200),
    year: cell(row, mapping.year)?.slice(0, 40),
  };
}

export const FIELD_LABELS: Record<ContactField, string> = {
  email: "Email",
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name (split)",
  phone: "Phone",
  college: "College",
  branch: "Branch",
  year: "Year",
};
