import { klymbRead } from "./client";
import { prettyEventId } from "./filter";

export interface KlymbOption {
  id: string;
  label: string;
  count: number;
}

export interface KlymbFilterOptions {
  hackathons: KlymbOption[];
  videothons: KlymbOption[];
  workshops: KlymbOption[];
  cohorts: KlymbOption[];
  graduationYears: number[];
  utmSources: KlymbOption[];
  utmCampaigns: KlymbOption[];
}

/**
 * Dropdown values for the filter builder, read live from Klymb.
 *
 * Workshops are listed from their registrations, not from WorkshopEvent: most
 * registered workshops predate that table and have no row in it. The title is
 * used when a row exists; otherwise the id (e.g. workshop-2026-09-05) is shown.
 */
export async function loadKlymbFilterOptions(): Promise<KlymbFilterOptions> {
  return klymbRead(async (q) => {
    const hackathons = await q<{ id: string; n: number }>(
      `SELECT "eventId" AS id, count(*)::int AS n FROM "HackathonParticipant" GROUP BY 1 ORDER BY max("createdAt") DESC`,
    );
    const videothons = await q<{ id: string; n: number }>(
      `SELECT "eventId" AS id, count(*)::int AS n FROM "HackathonVideoRegistration" GROUP BY 1 ORDER BY max("createdAt") DESC`,
    );
    const workshops = await q<{ id: string; title: string | null; n: number }>(
      `SELECT r."eventId" AS id, max(e.title) AS title, count(*)::int AS n
       FROM "WorkshopRegistration" r LEFT JOIN "WorkshopEvent" e ON e.id = r."eventId"
       GROUP BY r."eventId" ORDER BY max(r."createdAt") DESC`,
    );
    const cohorts = await q<{ id: string; name: string; n: number }>(
      `SELECT c.id, c.name, count(pe.id)::int AS n
       FROM "Cohort" c LEFT JOIN "ProgramEnrollment" pe ON pe."cohortId" = c.id
       GROUP BY c.id, c.name ORDER BY n DESC, c.name`,
    );
    const years = await q<{ y: number }>(
      `SELECT DISTINCT y FROM (
         SELECT "graduationYear" AS y FROM "CandidateEducation"
         UNION SELECT "graduationYear" FROM "HackathonParticipant"
         UNION SELECT "graduationYear" FROM "WorkshopRegistration"
       ) t WHERE y BETWEEN 1990 AND 2040 ORDER BY y DESC`,
    );
    const utmSources = await q<{ id: string; n: number }>(
      `SELECT lower("utmSource") AS id, count(*)::int AS n FROM "User"
       WHERE "utmSource" IS NOT NULL AND "deletedAt" IS NULL GROUP BY 1 ORDER BY n DESC LIMIT 50`,
    );
    const utmCampaigns = await q<{ id: string; n: number }>(
      `SELECT lower("utmCampaign") AS id, count(*)::int AS n FROM "User"
       WHERE "utmCampaign" IS NOT NULL AND "deletedAt" IS NULL GROUP BY 1 ORDER BY n DESC LIMIT 50`,
    );

    const plain = (rows: { id: string; n: number }[]) => rows.map((r) => ({ id: r.id, label: r.id, count: r.n }));
    const pretty = (rows: { id: string; n: number }[]) =>
      rows.map((r) => ({ id: r.id, label: prettyEventId(r.id), count: r.n }));
    return {
      hackathons: hackathons.map((h) => ({
        id: h.id,
        label: h.id === "legacy" ? "First hackathon" : prettyEventId(h.id),
        count: h.n,
      })),
      videothons: pretty(videothons),
      workshops: workshops.map((w) => ({ id: w.id, label: w.title ?? prettyEventId(w.id), count: w.n })),
      cohorts: cohorts.map((c) => ({ id: c.id, label: c.name, count: c.n })),
      graduationYears: years.map((y) => y.y),
      utmSources: plain(utmSources),
      utmCampaigns: plain(utmCampaigns),
    };
  });
}
