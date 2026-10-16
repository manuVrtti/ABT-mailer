import type { KlymbFilter, KlymbSource } from "./filter";

/**
 * Compiles a KlymbFilter into ONE parameterized SELECT against the Klymb
 * database. Every user-supplied value goes through `$n` placeholders — nothing
 * from the filter is ever concatenated into the SQL text.
 *
 * `people` is one row per reachable person:
 *   * every live Klymb User (not deleted, anonymized or disabled), with the
 *     attributes the filters need resolved from wherever Klymb keeps them;
 *   * plus newsletter subscribers who have no account at all.
 *
 * Attribute precedence (first non-empty wins):
 *   user_type  recruiter profile / role → CandidateProfile.primaryPersona →
 *              latest workshop form role / VideoThon employment → any
 *              hackathon entry (coder hackathon = students) → UNKNOWN
 *   college    latest CandidateEducation → hackathon form → workshop form (students)
 *   company    RecruiterProfile → current CandidateExperience → workshop form (professionals)
 *   grad year  CandidateEducation → hackathon form → workshop form
 *   city       CandidateProfile → VideoThon form
 */
const JUNK_VALUES = ["na", "n/a", "n.a.", "none", "nil", "null", "-", "--", ".", "no", "nothing", "not applicable"]
  .map((v) => `'${v}'`)
  .join(", ");

export const PEOPLE_CTE = `
raw_people AS (
  SELECT
    u.id AS user_id,
    lower(u.email) AS email,
    NULLIF(btrim(COALESCE(NULLIF(btrim(cp."fullName"), ''), NULLIF(btrim(u.name), ''), ws.name, hp."fullName", vr."fullName")), '') AS name,
    CASE
      WHEN rp.id IS NOT NULL OR u.role::text = 'RECRUITER' THEN 'RECRUITER'
      WHEN cp."primaryPersona"::text = 'PROFESSIONAL' THEN 'PROFESSIONAL'
      WHEN cp."primaryPersona"::text = 'STUDENT' THEN 'STUDENT'
      WHEN ws.role = 'Professional' OR vr.employment::text = 'WORKING' THEN 'PROFESSIONAL'
      WHEN ws.role = 'Student' OR hp.id IS NOT NULL OR vr.employment::text = 'LEARNER' THEN 'STUDENT'
      ELSE 'UNKNOWN'
    END AS user_type,
    NULLIF(btrim(COALESCE(
      NULLIF(btrim(rp.company), ''),
      NULLIF(btrim(ex."companyName"), ''),
      CASE WHEN ws.role = 'Professional' THEN NULLIF(btrim(ws.organization), '') END
    )), '') AS company,
    NULLIF(btrim(COALESCE(
      NULLIF(btrim(ed."institutionName"), ''),
      NULLIF(btrim(hp.college), ''),
      CASE WHEN ws.role = 'Student' THEN NULLIF(btrim(ws.organization), '') END
    )), '') AS college,
    COALESCE(ed."graduationYear", hp."graduationYear", ws."graduationYear") AS graduation_year,
    NULLIF(btrim(COALESCE(NULLIF(btrim(cp."locationCity"), ''), vr.city)), '') AS city,
    NULLIF(btrim(COALESCE(NULLIF(btrim(cp."locationRegion"), ''), vr.state)), '') AS region,
    u."createdAt" AS signed_up_at,
    u."utmSource" AS utm_source,
    u."utmCampaign" AS utm_campaign
  FROM "User" u
  LEFT JOIN "CandidateProfile" cp ON cp."userId" = u.id
  LEFT JOIN "RecruiterProfile" rp ON rp."userId" = u.id
  LEFT JOIN LATERAL (
    SELECT e."institutionName", e."graduationYear" FROM "CandidateEducation" e
    WHERE e."userId" = u.id
    ORDER BY e."isCurrent" DESC, e."graduationYear" DESC NULLS LAST, e."sortOrder" ASC
    LIMIT 1
  ) ed ON true
  LEFT JOIN LATERAL (
    SELECT x."companyName" FROM "CandidateExperience" x
    WHERE x."userId" = u.id AND x."isCurrent"
    ORDER BY x."startedOn" DESC
    LIMIT 1
  ) ex ON true
  LEFT JOIN LATERAL (
    SELECT w.name, w.role, w.organization, w."graduationYear" FROM "WorkshopRegistration" w
    WHERE w."userId" = u.id
    ORDER BY w."createdAt" DESC
    LIMIT 1
  ) ws ON true
  LEFT JOIN LATERAL (
    SELECT h.id, h."fullName", h.college, h."graduationYear" FROM "HackathonParticipant" h
    WHERE h."userId" = u.id
    ORDER BY h."createdAt" DESC
    LIMIT 1
  ) hp ON true
  LEFT JOIN LATERAL (
    SELECT v."fullName", v.employment, v.city, v.state FROM "HackathonVideoRegistration" v
    WHERE v."userId" = u.id
    ORDER BY v."createdAt" DESC
    LIMIT 1
  ) vr ON true
  WHERE u."deletedAt" IS NULL
    AND u."anonymizedAt" IS NULL
    AND u."disabledAt" IS NULL
    AND u.email LIKE '%_@_%'

  UNION ALL

  -- Newsletter subscribers with no account. An address that belongs to ANY
  -- User row (including deleted ones) is left to the branch above.
  SELECT
    NULL, lower(n.email), NULL, 'UNKNOWN', NULL, NULL, NULL, NULL, NULL,
    n."subscribedAt", NULL, NULL
  FROM "NewsletterSubscription" n
  WHERE n."userId" IS NULL
    AND n.email LIKE '%_@_%'
    AND NOT EXISTS (SELECT 1 FROM "User" u2 WHERE lower(u2.email) = lower(n.email))
),
-- Form answers like "NA" or "-" are not a company or a college.
people AS (
  SELECT
    user_id, email, name, user_type,
    CASE WHEN lower(company) IN (${JUNK_VALUES}) THEN NULL ELSE company END AS company,
    CASE WHEN lower(college) IN (${JUNK_VALUES}) THEN NULL ELSE college END AS college,
    graduation_year, city, region, signed_up_at, utm_source, utm_campaign
  FROM raw_people
)`;

export interface CompiledQuery {
  text: string;
  values: unknown[];
}

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

/** `%term%` for ILIKE, with LIKE metacharacters in the term escaped. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function sourceSql(s: KlymbSource, p: Params): string {
  switch (s.kind) {
    case "all_users":
      return "p.user_id IS NOT NULL";
    case "hackathon": {
      const conds = [`h."userId" = p.user_id`];
      if (s.eventIds.length) conds.push(`h."eventId" = ANY(${p.add(s.eventIds)}::text[])`);
      if (s.leadersOnly) conds.push(`h."isLeader"`);
      if (s.submitted === "yes") conds.push("hs.id IS NOT NULL");
      if (s.submitted === "no") conds.push("hs.id IS NULL");
      return `EXISTS (SELECT 1 FROM "HackathonParticipant" h LEFT JOIN "HackathonSubmission" hs ON hs."teamId" = h."teamId" WHERE ${conds.join(" AND ")})`;
    }
    case "videothon": {
      const conds = [`v."userId" = p.user_id`];
      if (s.eventIds.length) conds.push(`v."eventId" = ANY(${p.add(s.eventIds)}::text[])`);
      if (s.employment !== "any") conds.push(`v.employment::text = ${p.add(s.employment)}`);
      if (s.submitted === "yes") conds.push(`COALESCE(btrim(v."submissionUrl"), '') <> ''`);
      if (s.submitted === "no") conds.push(`COALESCE(btrim(v."submissionUrl"), '') = ''`);
      return `EXISTS (SELECT 1 FROM "HackathonVideoRegistration" v WHERE ${conds.join(" AND ")})`;
    }
    case "workshop": {
      const conds = [`w."userId" = p.user_id`];
      if (s.eventIds.length) conds.push(`w."eventId" = ANY(${p.add(s.eventIds)}::text[])`);
      return `EXISTS (SELECT 1 FROM "WorkshopRegistration" w WHERE ${conds.join(" AND ")})`;
    }
    case "cohort": {
      const conds = [`pe."userId" = p.user_id`];
      if (s.cohortIds.length) conds.push(`pe."cohortId" = ANY(${p.add(s.cohortIds)}::text[])`);
      if (s.statuses.length) conds.push(`pe.status::text = ANY(${p.add(s.statuses)}::text[])`);
      return `EXISTS (SELECT 1 FROM "ProgramEnrollment" pe WHERE ${conds.join(" AND ")})`;
    }
    case "newsletter":
      return subscribedSql(true);
    case "mock_interview":
      return `EXISTS (SELECT 1 FROM "MockInterview" mi WHERE mi."userId" = p.user_id)`;
    case "job_applicants":
      return `EXISTS (SELECT 1 FROM "JobApplication" ja WHERE ja."userId" = p.user_id)`;
  }
}

/** A newsletter row for this person (by address or by account) with `subscribed = value`. */
function subscribedSql(value: boolean): string {
  return `EXISTS (SELECT 1 FROM "NewsletterSubscription" ns WHERE (lower(ns.email) = p.email OR ns."userId" = p.user_id) AND ns.subscribed = ${value ? "true" : "false"})`;
}

function containsAny(column: string, list: string[], p: Params): string {
  return `${column} ILIKE ANY(${p.add(list.map(containsPattern))}::text[])`;
}

/** The WHERE clause over `people p` for one filter. */
function compileWhere(f: KlymbFilter, p: Params): string {
  const conds: string[] = [];
  conds.push(`(${f.sources.map((s) => sourceSql(s, p)).join(" OR ")})`);
  if (f.exclude.length) conds.push(`NOT (${f.exclude.map((s) => sourceSql(s, p)).join(" OR ")})`);

  if (f.userTypes.length) conds.push(`p.user_type = ANY(${p.add(f.userTypes)}::text[])`);
  if (f.colleges.include.length) conds.push(containsAny("p.college", f.colleges.include, p));
  if (f.colleges.exclude.length) conds.push(`(p.college IS NULL OR NOT ${containsAny("p.college", f.colleges.exclude, p)})`);
  if (f.companies.include.length) conds.push(containsAny("p.company", f.companies.include, p));
  if (f.companies.exclude.length) conds.push(`(p.company IS NULL OR NOT ${containsAny("p.company", f.companies.exclude, p)})`);
  if (f.cities.length) {
    const pat = p.add(f.cities.map(containsPattern));
    conds.push(`(p.city ILIKE ANY(${pat}::text[]) OR p.region ILIKE ANY(${pat}::text[]))`);
  }
  if (f.graduationYears.length) conds.push(`p.graduation_year = ANY(${p.add(f.graduationYears)}::int[])`);
  if (f.signedUpFrom) conds.push(`p.signed_up_at >= ${p.add(f.signedUpFrom)}::date`);
  if (f.signedUpTo) conds.push(`p.signed_up_at < (${p.add(f.signedUpTo)}::date + 1)`);
  if (f.utmSources.length) {
    conds.push(`lower(p.utm_source) = ANY(${p.add(f.utmSources.map((s) => s.toLowerCase()))}::text[])`);
  }
  if (f.utmCampaigns.length) {
    conds.push(`lower(p.utm_campaign) = ANY(${p.add(f.utmCampaigns.map((s) => s.toLowerCase()))}::text[])`);
  }
  if (f.openToWork) {
    conds.push(`EXISTS (SELECT 1 FROM "CandidatePreference" cpf WHERE cpf."userId" = p.user_id AND cpf."openToWork")`);
  }

  // Someone who unsubscribed in Klymb is never mailed, whatever the filter says.
  conds.push(`NOT ${subscribedSql(false)}`);
  if (f.consent === "only_opted_in") conds.push(subscribedSql(true));

  return conds.join("\n  AND ");
}

/**
 * `WITH people AS (…), matched AS (…)` — one row per distinct address that the
 * filter selects. Append a SELECT over `matched` to use it.
 */
export function matchedCte(f: KlymbFilter): CompiledQuery {
  const p = new Params();
  const where = compileWhere(f, p);
  const text = `WITH ${PEOPLE_CTE},
matched AS (
  SELECT DISTINCT ON (p.email) p.*
  FROM people p
  WHERE ${where}
  ORDER BY p.email, p.user_id NULLS LAST
)`;
  return { text, values: p.values };
}
