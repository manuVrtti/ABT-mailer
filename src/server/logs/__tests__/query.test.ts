import { describe, expect, it } from "vitest";
import { EmailEventType } from "@prisma/client";
import { dayRange, eventDetail, istDay, parseLogFilters } from "@/server/logs/query";

describe("parseLogFilters", () => {
  const now = new Date("2026-10-08T20:00:00Z"); // 9 Oct, 01:30 IST

  it("defaults to the last 7 IST days, all events and all mail", () => {
    const f = parseLogFilters({}, now);
    expect(f).toMatchObject({ q: "", field: "recipient", event: "all", type: "all", fromDay: "2026-10-03", toDay: "2026-10-09" });
    expect(f.before).toBeUndefined();
  });

  it("drops values it does not know", () => {
    const f = parseLogFilters({ event: "exploded", type: "sms", field: "body", from: "8/10/2026", before: "nope" }, now);
    expect(f).toMatchObject({ event: "all", type: "all", field: "recipient", fromDay: "2026-10-03" });
    expect(f.before).toBeUndefined();
  });

  it("keeps valid filters", () => {
    const f = parseLogFilters({ q: " a@b.in ", field: "subject", event: "bounced", type: "marketing", from: "2026-10-01", to: "2026-10-08" }, now);
    expect(f).toMatchObject({ q: "a@b.in", field: "subject", event: "bounced", type: "marketing", fromDay: "2026-10-01", toDay: "2026-10-08" });
  });
});

describe("dayRange", () => {
  it("covers whole IST days, end exclusive", () => {
    const { start, end } = dayRange({ fromDay: "2026-10-08", toDay: "2026-10-08" });
    expect(start.toISOString()).toBe("2026-10-07T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });

  it("istDay rolls over at IST midnight", () => {
    expect(istDay(new Date("2026-10-08T18:29:00Z"))).toBe("2026-10-08");
    expect(istDay(new Date("2026-10-08T18:30:00Z"))).toBe("2026-10-09");
  });
});

describe("eventDetail", () => {
  it("summarises a bounce", () => {
    const raw = { bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ diagnosticCode: "550 5.4.1 Access denied" }] } };
    expect(eventDetail(EmailEventType.BOUNCE, raw)).toBe("Permanent · General · 550 5.4.1 Access denied");
  });

  it("returns the clicked link", () => {
    expect(eventDetail(EmailEventType.CLICK, { click: { link: "https://abtalks.in/hackathon" } })).toBe("https://abtalks.in/hackathon");
  });

  it("is empty for opens and unknown shapes", () => {
    expect(eventDetail(EmailEventType.OPEN, { open: { ipAddress: "1.2.3.4" } })).toBe("");
    expect(eventDetail(EmailEventType.BOUNCE, null)).toBe("");
  });
});
