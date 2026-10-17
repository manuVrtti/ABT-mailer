import { describe, expect, it } from "vitest";
import { attribute, type Action, type Send } from "../attribute";
import { goalMatches, parseGoal } from "../kinds";

const d = (s: string) => new Date(s);
const send = (jobId: string, email: string, at: string, campaignId: string, clicks: string[] = []): Send => ({
  jobId,
  email,
  sentAt: d(at),
  campaignId,
  directSendId: null,
  clickTimes: clicks.map(d),
});
const act = (email: string, at: string, kind = "HACKATHON", ref: string | null = "h1"): Action => ({
  email,
  kind,
  ref,
  label: kind,
  at: d(at),
});

describe("attribute (last email wins)", () => {
  const sends = [
    send("mon", "asha@x.io", "2026-10-05T10:00:00Z", "announce"),
    send("wed", "asha@x.io", "2026-10-07T10:00:00Z", "reminder"),
    send("fri", "Asha@X.io", "2026-10-09T10:00:00Z", "lastcall", ["2026-10-09T12:00:00Z"]),
  ];

  it("credits the most recent email before the action, once", () => {
    const r = attribute(sends, [act("asha@x.io", "2026-10-10T09:00:00Z")], 7);
    expect(r).toHaveLength(1);
    expect(r[0]!.send.jobId).toBe("fri");
    expect(r[0]!.clicked).toBe(true);
  });

  it("ignores emails sent after the action", () => {
    const r = attribute(sends, [act("asha@x.io", "2026-10-08T09:00:00Z")], 7);
    expect(r[0]!.send.jobId).toBe("wed");
    expect(r[0]!.clicked).toBe(false);
  });

  it("drops actions outside the window or before any email", () => {
    expect(attribute(sends, [act("asha@x.io", "2026-10-17T10:00:01Z")], 7)).toHaveLength(0);
    expect(attribute(sends, [act("asha@x.io", "2026-10-01T10:00:00Z")], 7)).toHaveLength(0);
    expect(attribute(sends, [act("ravi@x.io", "2026-10-06T10:00:00Z")], 7)).toHaveLength(0);
  });

  it("a click after the action doesn't count as clicked-first", () => {
    const r = attribute(
      [send("j", "a@x.io", "2026-10-09T10:00:00Z", "c", ["2026-10-11T00:00:00Z"])],
      [act("a@x.io", "2026-10-10T00:00:00Z")],
      7,
    );
    expect(r[0]!.clicked).toBe(false);
  });

  it("each action is credited separately", () => {
    const r = attribute(sends, [act("asha@x.io", "2026-10-10T00:00:00Z"), act("asha@x.io", "2026-10-11T00:00:00Z", "SIGNUP", null)], 7);
    expect(r.map((x) => x.send.jobId)).toEqual(["fri", "fri"]);
  });
});

describe("goals", () => {
  it("matches kind and optional ref", () => {
    const g = parseGoal({ kind: "WORKSHOP", ref: "workshop-2026-10-17" });
    expect(goalMatches(g, { kind: "WORKSHOP", ref: "workshop-2026-10-17" })).toBe(true);
    expect(goalMatches(g, { kind: "WORKSHOP", ref: "other" })).toBe(false);
    expect(goalMatches(parseGoal({ kind: "SIGNUP" }), { kind: "SIGNUP", ref: null })).toBe(true);
    expect(goalMatches(null, { kind: "SIGNUP", ref: null })).toBe(false);
    expect(parseGoal({ kind: "NOPE" })).toBeNull();
  });
});
