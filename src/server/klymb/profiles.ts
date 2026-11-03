import { klymbRead } from "./client";
import { PEOPLE_CTE } from "./sql";
import type { UserType } from "./filter";

/**
 * Klymb details for specific people, looked up by email — for the
 * Conversions "People" list. Read-only like every Klymb query (see client.ts).
 */
export interface KlymbProfile {
  email: string;
  userId: string | null;
  name: string | null;
  userType: UserType;
  college: string | null;
  company: string | null;
  graduationYear: number | null;
  city: string | null;
  phone: string | null;
  linkedin: string | null;
  signedUpAt: Date | null;
}

const CHUNK = 5000;

/**
 * Phone: profile → recruiter profile → latest hackathon / workshop / VideoThon
 * form. LinkedIn: candidate profile.
 */
const CONTACT_SQL = `
SELECT u.id AS user_id,
  NULLIF(btrim(cp."linkedinUrl"), '') AS linkedin,
  COALESCE(
    NULLIF(btrim(cp.phone), ''),
    NULLIF(btrim(rp.phone), ''),
    (SELECT NULLIF(btrim(h.phone), '') FROM "HackathonParticipant" h
      WHERE h."userId" = u.id AND COALESCE(btrim(h.phone), '') <> '' ORDER BY h."createdAt" DESC LIMIT 1),
    (SELECT NULLIF(btrim(w.phone), '') FROM "WorkshopRegistration" w
      WHERE w."userId" = u.id AND COALESCE(btrim(w.phone), '') <> '' ORDER BY w."createdAt" DESC LIMIT 1),
    (SELECT NULLIF(btrim(concat_ws(' ', NULLIF(btrim(v."phoneCountryCode"), ''), v."phoneNumber")), '')
      FROM "HackathonVideoRegistration" v
      WHERE v."userId" = u.id AND COALESCE(btrim(v."phoneNumber"), '') <> '' ORDER BY v."createdAt" DESC LIMIT 1)
  ) AS phone
FROM "User" u
LEFT JOIN "CandidateProfile" cp ON cp."userId" = u.id
LEFT JOIN "RecruiterProfile" rp ON rp."userId" = u.id
WHERE u.id = ANY($1::text[])`;

type PeopleRow = {
  user_id: string | null;
  email: string;
  name: string | null;
  user_type: UserType;
  company: string | null;
  college: string | null;
  graduation_year: number | null;
  city: string | null;
  signed_up_at: Date | null;
};

/** Profiles by lower-cased email. People not in Klymb are simply absent. */
export async function klymbProfiles(emails: string[]): Promise<Map<string, KlymbProfile>> {
  const out = new Map<string, KlymbProfile>();
  const wanted = [...new Set(emails.map((e) => e.toLowerCase()))];
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK);
    await klymbRead(
      async (q) => {
        const people = await q<PeopleRow>(
          `WITH ${PEOPLE_CTE}
SELECT user_id, email, name, user_type, company, college, graduation_year, city, signed_up_at
FROM people WHERE email = ANY($1::text[])`,
          [chunk],
        );
        const ids = people.map((p) => p.user_id).filter((x): x is string => Boolean(x));
        const contacts = ids.length
          ? await q<{ user_id: string; phone: string | null; linkedin: string | null }>(CONTACT_SQL, [ids])
          : [];
        const byId = new Map(contacts.map((c) => [c.user_id, c]));
        for (const p of people) {
          // An address can have an account and a newsletter row; the account wins.
          if (out.has(p.email) && !p.user_id) continue;
          const c = p.user_id ? byId.get(p.user_id) : undefined;
          out.set(p.email, {
            email: p.email,
            userId: p.user_id,
            name: p.name,
            userType: p.user_type,
            college: p.college,
            company: p.company,
            graduationYear: p.graduation_year,
            city: p.city,
            phone: c?.phone ?? null,
            linkedin: c?.linkedin ?? null,
            signedUpAt: p.signed_up_at,
          });
        }
      },
      { timeoutMs: 30_000 },
    );
  }
  return out;
}
