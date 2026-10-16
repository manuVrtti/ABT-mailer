import { klymbRead } from "./client";
import { containsPattern } from "./sql";

/**
 * Type-ahead values for the filter builder: distinct colleges / companies /
 * cities / UTM values in Klymb containing the typed text, with how many people
 * have each. Reads the same sources the filter resolves from (see PEOPLE_CTE),
 * but straight from the base tables so it is fast enough per keystroke.
 *
 * Spellings that differ only in case or spacing are one entry, shown with the
 * most common spelling. Counts are distinct people per value.
 */

export const SUGGEST_FIELDS = ["college", "company", "city", "utm_source", "utm_campaign"] as const;
export type SuggestField = (typeof SUGGEST_FIELDS)[number];

export interface Suggestion {
  value: string;
  count: number;
}

const LIVE_USER = `u."deletedAt" IS NULL AND u."anonymizedAt" IS NULL AND u."disabledAt" IS NULL`;

/** (user_id, value) pairs for each field, from every place Klymb stores it. */
const SOURCES: Record<SuggestField, string> = {
  college: `
    SELECT e."userId" AS user_id, e."institutionName" AS v FROM "CandidateEducation" e
    UNION ALL SELECT h."userId", h.college FROM "HackathonParticipant" h
    UNION ALL SELECT w."userId", w.organization FROM "WorkshopRegistration" w WHERE w.role = 'Student'`,
  company: `
    SELECT r."userId" AS user_id, r.company AS v FROM "RecruiterProfile" r
    UNION ALL SELECT x."userId", x."companyName" FROM "CandidateExperience" x WHERE x."isCurrent"
    UNION ALL SELECT w."userId", w.organization FROM "WorkshopRegistration" w WHERE w.role = 'Professional'`,
  city: `
    SELECT c."userId" AS user_id, c."locationCity" AS v FROM "CandidateProfile" c
    UNION ALL SELECT c."userId", c."locationRegion" FROM "CandidateProfile" c
    UNION ALL SELECT v."userId", v.city FROM "HackathonVideoRegistration" v
    UNION ALL SELECT v."userId", v.state FROM "HackathonVideoRegistration" v`,
  utm_source: `SELECT u.id AS user_id, u."utmSource" AS v FROM "User" u`,
  utm_campaign: `SELECT u.id AS user_id, u."utmCampaign" AS v FROM "User" u`,
};

const JUNK = `('na', 'n/a', 'n.a.', 'none', 'nil', 'null', '-', '--', '.', 'no', 'nothing', 'not applicable')`;

export async function suggestKlymbValues(field: SuggestField, q: string, limit = 15): Promise<Suggestion[]> {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const sql = `
    WITH vals AS (${SOURCES[field]}),
    hits AS (
      SELECT vals.user_id, btrim(vals.v) AS v
      FROM vals JOIN "User" u ON u.id = vals.user_id
      WHERE ${LIVE_USER}
        AND vals.v ILIKE $1
        AND lower(btrim(vals.v)) NOT IN ${JUNK}
    )
    SELECT mode() WITHIN GROUP (ORDER BY v) AS value, count(DISTINCT user_id)::int AS count
    FROM hits
    GROUP BY lower(regexp_replace(v, '\\s+', ' ', 'g'))
    ORDER BY count DESC, value
    LIMIT ${Math.max(1, Math.min(50, Math.floor(limit)))}`;
  return klymbRead((query) => query<{ value: string; count: number }>(sql, [containsPattern(term)]), {
    timeoutMs: 8_000,
  });
}
