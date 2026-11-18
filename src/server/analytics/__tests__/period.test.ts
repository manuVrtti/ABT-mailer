import { describe, expect, it } from "vitest";
import { autoGrouping, bucketKeys, istDay, previousPeriod, resolvePeriod, weekStart } from "../period";

// Wed 18 Nov 2026, 10:00 IST (04:30 UTC).
const now = new Date("2026-11-18T04:30:00Z");

describe("resolvePeriod", () => {
  it("this week starts on Monday", () => {
    const p = resolvePeriod({ preset: "this_week" }, now);
    expect([p.fromDay, p.toDay, p.days]).toEqual(["2026-11-16", "2026-11-18", 3]);
  });

  it("this month / this year run to today", () => {
    expect(resolvePeriod({ preset: "this_month" }, now).fromDay).toBe("2026-11-01");
    expect(resolvePeriod({ preset: "this_year" }, now)).toMatchObject({ fromDay: "2026-01-01", toDay: "2026-11-18" });
  });

  it("last month and last year are whole", () => {
    expect(resolvePeriod({ preset: "last_month" }, now)).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-31", days: 31 });
    expect(resolvePeriod({ preset: "last_year" }, now)).toMatchObject({ fromDay: "2025-01-01", toDay: "2025-12-31", days: 365 });
  });

  it("uses IST midnights as boundaries", () => {
    const p = resolvePeriod({ preset: "last_7" }, now);
    expect(p.from.toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(p.to.toISOString()).toBe("2026-11-18T18:30:00.000Z");
  });

  it("custom: swaps reversed dates, stops at today, falls back on junk", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-11-30", to: "2026-11-01" }, now)).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-18" });
    expect(resolvePeriod({ preset: "custom", from: "nope", to: "2026-11-01" }, now)).toMatchObject({ preset: "last_30", days: 30 });
    expect(resolvePeriod({ preset: "whatever" }, now).preset).toBe("last_30");
  });

  it("custom ranges are capped at about 3 years", () => {
    const p = resolvePeriod({ preset: "custom", from: "2015-01-01", to: "2026-11-18" }, now);
    expect(p.days).toBe(3 * 366);
    expect(p.toDay).toBe("2026-11-18");
  });
});

describe("helpers", () => {
  it("previous period is the same length right before", () => {
    const prev = previousPeriod(resolvePeriod({ preset: "last_month" }, now));
    expect([prev.fromDay, prev.toDay]).toEqual(["2026-08-31", "2026-09-30"]);
  });

  it("IST day rolls over at 18:30 UTC", () => {
    expect(istDay(new Date("2026-11-18T18:29:00Z"))).toBe("2026-11-18");
    expect(istDay(new Date("2026-11-18T18:30:00Z"))).toBe("2026-11-19");
  });

  it("weeks start on Monday, buckets cover the range", () => {
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(bucketKeys("2026-01-15", "2026-03-02", "month")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(bucketKeys("2026-11-16", "2026-11-18", "day")).toHaveLength(3);
  });

  it("groups by day, then week, then month as ranges grow", () => {
    expect([autoGrouping(30), autoGrouping(90), autoGrouping(322)]).toEqual(["day", "week", "month"]);
  });
});
