import { klymbRead } from "./client";
import type { KlymbFilter, UserType } from "./filter";
import { matchedCte } from "./sql";

export interface KlymbPerson {
  userId: string | null;
  email: string;
  name: string | null;
  userType: UserType;
  company: string | null;
  college: string | null;
  graduationYear: number | null;
  city: string | null;
}

export interface KlymbPreview {
  total: number;
  byType: Record<UserType, number>;
  topColleges: { name: string; count: number }[];
  topCompanies: { name: string; count: number }[];
  sample: KlymbPerson[];
}

type Row = {
  user_id: string | null;
  email: string;
  name: string | null;
  user_type: UserType;
  company: string | null;
  college: string | null;
  graduation_year: number | null;
  city: string | null;
};

const COLUMNS = "user_id, email, name, user_type, company, college, graduation_year, city";

function toPerson(r: Row): KlymbPerson {
  return {
    userId: r.user_id,
    email: r.email,
    name: r.name,
    userType: r.user_type,
    company: r.company,
    college: r.college,
    graduationYear: r.graduation_year,
    city: r.city,
  };
}

/** Count, breakdown and a sample of who the filter selects — for the builder's live preview. */
export async function previewKlymbFilter(filter: KlymbFilter, sampleSize = 20): Promise<KlymbPreview> {
  const { text, values } = matchedCte(filter);
  // One statement: `matched` is referenced several times, so Postgres
  // materializes it once instead of re-running the filter per breakdown.
  // Top colleges / companies group case-insensitively and show the most
  // common spelling.
  const top = (col: "college" | "company") => `(
    SELECT COALESCE(json_agg(json_build_object('name', t.name, 'count', t.n) ORDER BY t.n DESC, t.name), '[]'::json)
    FROM (
      SELECT mode() WITHIN GROUP (ORDER BY ${col}) AS name, count(*)::int AS n
      FROM matched WHERE ${col} IS NOT NULL GROUP BY lower(${col}) ORDER BY n DESC LIMIT 8
    ) t)`;
  const sql = `${text}
SELECT
  (SELECT COALESCE(json_object_agg(user_type, n), '{}'::json)
     FROM (SELECT user_type, count(*)::int AS n FROM matched GROUP BY user_type) t) AS by_type,
  ${top("college")} AS top_colleges,
  ${top("company")} AS top_companies,
  (SELECT COALESCE(json_agg(s), '[]'::json) FROM (
     SELECT ${COLUMNS} FROM matched ORDER BY signed_up_at DESC NULLS LAST LIMIT ${Math.floor(sampleSize)}
   ) s) AS sample`;

  const [row] = await klymbRead((q) =>
    q<{
      by_type: Partial<Record<UserType, number>>;
      top_colleges: { name: string; count: number }[];
      top_companies: { name: string; count: number }[];
      sample: Row[];
    }>(sql, values),
  );
  const byType: Record<UserType, number> = { STUDENT: 0, PROFESSIONAL: 0, RECRUITER: 0, UNKNOWN: 0, ...row!.by_type };
  return {
    total: Object.values(byType).reduce((a, b) => a + b, 0),
    byType,
    topColleges: row!.top_colleges,
    topCompanies: row!.top_companies,
    sample: row!.sample.map(toPerson),
  };
}

/** Everyone the filter selects, for a list refresh. */
export async function fetchKlymbMatches(filter: KlymbFilter): Promise<KlymbPerson[]> {
  const { text, values } = matchedCte(filter);
  return klymbRead(
    async (q) => (await q<Row>(`${text} SELECT ${COLUMNS} FROM matched ORDER BY email`, values)).map(toPerson),
    { timeoutMs: 60_000 },
  );
}
