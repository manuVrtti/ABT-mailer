import { describe, expect, it } from "vitest";
import { klymbFilterSchema, describeKlymbFilter, defaultKlymbFilter, formatYears, prettyEventId } from "../filter";
import { containsPattern, matchedCte } from "../sql";
import { assertReadOnlySql } from "../client";

const parse = (raw: unknown) => klymbFilterSchema.parse(raw);

describe("klymbFilterSchema", () => {
  it("fills defaults", () => {
    const f = defaultKlymbFilter();
    expect(f.sources).toEqual([{ kind: "all_users" }]);
    expect(f.exclude).toEqual([]);
    expect(f.consent).toBe("exclude_opted_out");
    expect(f.colleges).toEqual({ include: [], exclude: [] });
  });

  it("requires at least one source", () => {
    expect(() => parse({ sources: [] })).toThrow();
  });

  it("rejects unknown source kinds and bad dates", () => {
    expect(() => parse({ sources: [{ kind: "everyone" }] })).toThrow();
    expect(() => parse({ sources: [{ kind: "all_users" }], signedUpFrom: "next tuesday" })).toThrow();
  });

  it("treats an empty date as unset", () => {
    expect(parse({ sources: [{ kind: "all_users" }], signedUpFrom: "" }).signedUpFrom).toBeUndefined();
  });
});

describe("matchedCte", () => {
  it("never puts filter values in the SQL text", () => {
    const evil = "x'); DROP TABLE \"User\"; --";
    const { text, values } = matchedCte(
      parse({
        sources: [{ kind: "hackathon", eventIds: [evil] }, { kind: "workshop", eventIds: [evil] }],
        exclude: [{ kind: "cohort", cohortIds: [evil], statuses: ["DROPPED"] }],
        colleges: { include: [evil], exclude: [evil] },
        companies: { include: [evil] },
        cities: [evil],
        utmSources: [evil],
        utmCampaigns: [evil],
      }),
    );
    expect(text).not.toContain("DROP");
    expect(values.flat()).toContain("%x'); DROP TABLE \"User\"; --%");
    expect(values.flat()).toContain(evil);
    expect(() => assertReadOnlySql(`${text} SELECT count(*) FROM matched`)).not.toThrow();
  });

  it("numbers placeholders to match the values", () => {
    const { text, values } = matchedCte(
      parse({
        sources: [{ kind: "hackathon", eventIds: ["legacy"], submitted: "no", leadersOnly: true }],
        userTypes: ["STUDENT", "RECRUITER"],
        graduationYears: [2026, 2027],
        signedUpFrom: "2026-01-01",
        signedUpTo: "2026-12-31",
      }),
    );
    const used = new Set([...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    expect(used.size).toBe(values.length);
    expect(Math.max(...used)).toBe(values.length);
    expect(text).toContain('h."isLeader"');
    expect(text).toContain("hs.id IS NULL");
  });

  it("ORs sources together and NOTs exclusions", () => {
    const { text } = matchedCte(
      parse({
        sources: [{ kind: "workshop" }, { kind: "newsletter" }],
        exclude: [{ kind: "workshop", eventIds: ["workshop-2026-10-17"] }],
      }),
    );
    expect(text).toMatch(/\(EXISTS \(SELECT 1 FROM "WorkshopRegistration" w WHERE w\."userId" = p\.user_id\) OR EXISTS/);
    expect(text).toMatch(/NOT \(EXISTS \(SELECT 1 FROM "WorkshopRegistration" w WHERE w\."userId" = p\.user_id AND w\."eventId" = ANY\(\$1::text\[\]\)\)\)/);
  });

  it("always removes newsletter opt-outs, and requires opt-in only when asked", () => {
    const base = matchedCte(parse({ sources: [{ kind: "all_users" }] })).text;
    expect(base).toContain("AND NOT EXISTS (SELECT 1 FROM \"NewsletterSubscription\" ns");
    expect(base).toContain("ns.subscribed = false");
    expect(base).not.toContain("ns.subscribed = true");

    const optIn = matchedCte(parse({ sources: [{ kind: "all_users" }], consent: "only_opted_in" })).text;
    expect(optIn).toContain("ns.subscribed = true");
  });

  it("skips deleted, anonymized and disabled accounts", () => {
    const { text } = matchedCte(defaultKlymbFilter());
    expect(text).toContain('u."deletedAt" IS NULL');
    expect(text).toContain('u."anonymizedAt" IS NULL');
    expect(text).toContain('u."disabledAt" IS NULL');
  });
});

describe("containsPattern", () => {
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("ABES")).toBe("%ABES%");
    expect(containsPattern("100%_a\\b")).toBe("%100\\%\\_a\\\\b%");
  });
});

describe("assertReadOnlySql", () => {
  it("allows plain reads", () => {
    expect(() => assertReadOnlySql("SELECT 1")).not.toThrow();
    expect(() => assertReadOnlySql("  with t as (select 1) select * from t")).not.toThrow();
    // Words inside quoted identifiers and strings are not statements.
    expect(() => assertReadOnlySql(`SELECT "updatedAt", 'delete me' FROM "User"`)).not.toThrow();
  });

  it("refuses writes, DDL and stacked statements", () => {
    for (const sql of [
      "UPDATE \"User\" SET name = 'x'",
      "DELETE FROM \"User\"",
      "INSERT INTO \"User\" VALUES (1)",
      "DROP TABLE \"User\"",
      "WITH d AS (DELETE FROM \"User\" RETURNING *) SELECT * FROM d",
      "SELECT 1; DELETE FROM \"User\"",
      "SELECT 1; SELECT 2",
      "SET default_transaction_read_only = off",
      "TRUNCATE \"User\"",
      "/* SELECT */ DELETE FROM \"User\"",
    ]) {
      expect(() => assertReadOnlySql(sql), sql).toThrow();
    }
  });
});

describe("describeKlymbFilter", () => {
  it("spells the filter out in words", () => {
    const lines = describeKlymbFilter(
      parse({
        sources: [{ kind: "hackathon", eventIds: ["legacy"], submitted: "no" }],
        exclude: [{ kind: "workshop", eventIds: ["workshop-2026-10-17"] }],
        userTypes: ["STUDENT"],
      }),
    );
    expect(lines[0]).toBe("Anyone who is: Hackathon participants (First hackathon) who did NOT submit");
    expect(lines).toContain("Except: Workshop registrants (Workshop · 17 Oct 2026)");
    expect(lines).toContain("Only: Students");
  });

  it("names cohorts when their names are given", () => {
    const f = parse({ sources: [{ kind: "cohort", cohortIds: ["c1"], statuses: ["ACTIVE"] }] });
    expect(describeKlymbFilter(f)[0]).toBe("Anyone who is: Cohort / program members (1 selected) — active");
    expect(describeKlymbFilter(f, { c1: "AI Cohort" })[0]).toBe("Anyone who is: Cohort / program members (AI Cohort) — active");
  });
});

describe("prettyEventId", () => {
  it("turns ids into readable names", () => {
    expect(prettyEventId("workshop-2026-09-05")).toBe("Workshop · 5 Sep 2026");
    expect(prettyEventId("linkedin-ai-interview")).toBe("LinkedIn AI Interview");
    expect(prettyEventId("vicodathon-2-2026")).toBe("Vicodathon 2 2026");
    expect(prettyEventId("2026-10-17")).toBe("17 Oct 2026");
  });
});

describe("formatYears", () => {
  it("collapses runs into ranges", () => {
    expect(formatYears([2028, 2026, 2027, 2030])).toBe("2026–2028, 2030");
    expect(formatYears([2026])).toBe("2026");
    expect(formatYears([])).toBe("");
  });
});
