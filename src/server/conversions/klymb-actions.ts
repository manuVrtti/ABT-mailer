import { klymbRead } from "@/server/klymb/client";
import { eventName } from "@/server/klymb/filter";
import type { Action } from "./attribute";
import type { ConversionKind } from "./kinds";

/**
 * What these addresses did in Klymb since `since`: signups, workshop /
 * hackathon / VideoThon registrations, cohort enrollments, job applications
 * and mock interviews. Read-only (klymbRead), one statement.
 */
export async function fetchKlymbActions(emails: string[], since: Date): Promise<Action[]> {
  if (emails.length === 0) return [];
  const rows = await klymbRead(
    (q) =>
      q<{ email: string; kind: ConversionKind; ref: string | null; label: string | null; at: Date }>(
        `WITH people AS (
           SELECT u.id, lower(u.email) AS email, u."createdAt" AS created
           FROM "User" u
           WHERE lower(u.email) = ANY($1::text[]) AND u."deletedAt" IS NULL
         )
         SELECT p.email, 'SIGNUP' AS kind, NULL AS ref, NULL AS label, p.created AS at
           FROM people p WHERE p.created >= $2
         UNION ALL
         SELECT p.email, 'WORKSHOP', w."eventId", e.title, w."createdAt"
           FROM "WorkshopRegistration" w JOIN people p ON p.id = w."userId"
           LEFT JOIN "WorkshopEvent" e ON e.id = w."eventId"
           WHERE w."createdAt" >= $2
         UNION ALL
         SELECT p.email, 'HACKATHON', h."eventId", NULL, h."createdAt"
           FROM "HackathonParticipant" h JOIN people p ON p.id = h."userId" WHERE h."createdAt" >= $2
         UNION ALL
         SELECT p.email, 'VIDEOTHON', v."eventId", NULL, v."createdAt"
           FROM "HackathonVideoRegistration" v JOIN people p ON p.id = v."userId" WHERE v."createdAt" >= $2
         UNION ALL
         -- A team's first submission, credited to each member who was emailed.
         SELECT p.email, 'SUBMISSION', h."eventId", NULL, hs."createdAt"
           FROM "HackathonSubmission" hs JOIN "HackathonParticipant" h ON h."teamId" = hs."teamId"
           JOIN people p ON p.id = h."userId" WHERE hs."createdAt" >= $2
         UNION ALL
         SELECT p.email, 'SUBMISSION', v."eventId", NULL, v."submissionUpdatedAt"
           FROM "HackathonVideoRegistration" v JOIN people p ON p.id = v."userId"
           WHERE v."submissionUpdatedAt" >= $2 AND COALESCE(btrim(v."submissionUrl"), '') <> ''
         UNION ALL
         SELECT p.email, 'COHORT', pe."cohortId", c.name, pe."joinedAt"
           FROM "ProgramEnrollment" pe JOIN people p ON p.id = pe."userId"
           JOIN "Cohort" c ON c.id = pe."cohortId" WHERE pe."joinedAt" >= $2
         UNION ALL
         SELECT p.email, 'JOB', ja."jobId", j.title || ' · ' || j.company, ja."createdAt"
           FROM "JobApplication" ja JOIN people p ON p.id = ja."userId"
           JOIN "Job" j ON j.id = ja."jobId" WHERE ja."createdAt" >= $2
         UNION ALL
         SELECT p.email, 'MOCK_INTERVIEW', mi."domainSlug", NULL, mi."createdAt"
           FROM "MockInterview" mi JOIN people p ON p.id = mi."userId" WHERE mi."createdAt" >= $2`,
        [emails.map((e) => e.toLowerCase()), since],
      ),
    { timeoutMs: 60_000 },
  );
  return rows.map((r) => ({
    email: r.email,
    kind: r.kind,
    ref: r.ref,
    label: labelFor(r.kind, r.ref, r.label),
    at: new Date(r.at),
  }));
}

function labelFor(kind: ConversionKind, ref: string | null, label: string | null): string {
  switch (kind) {
    case "SIGNUP":
      return "Signed up";
    case "WORKSHOP":
      return `Workshop · ${label ?? (ref ? eventName(ref) : "")}`;
    case "HACKATHON":
      return `Hackathon · ${ref ? eventName(ref) : ""}`;
    case "VIDEOTHON":
      return `VideoThon · ${ref ? eventName(ref) : ""}`;
    case "SUBMISSION":
      return `Submitted · ${ref ? eventName(ref) : ""}`;
    case "COHORT":
      return `Cohort · ${label ?? ref ?? ""}`;
    case "JOB":
      return `Applied · ${label ?? "a job"}`;
    case "MOCK_INTERVIEW":
      return `Mock interview${ref ? ` · ${eventName(ref)}` : ""}`;
  }
}
