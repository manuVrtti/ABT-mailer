import { describe, expect, it } from "vitest";
import { parseSourceKey, peopleCounts, selectPeople, sourceKey, type EngagedPerson } from "../people";

const at = (d: number) => new Date(Date.UTC(2026, 9, d));
const person = (email: string, extra: Partial<EngagedPerson> = {}): EngagedPerson => ({
  email,
  jobId: `job-${email}`,
  sentAt: at(1),
  deliveredAt: at(1),
  openedAt: null,
  opens: 0,
  clickedAt: null,
  clicks: 0,
  links: [],
  actions: [],
  name: null,
  userType: null,
  college: null,
  company: null,
  graduationYear: null,
  city: null,
  phone: null,
  linkedin: null,
  inKlymb: true,
  ...extra,
});

const asha = person("asha@x.in", { name: "Asha", college: "IIT Delhi", openedAt: at(2), opens: 3 });
const ravi = person("ravi@x.in", { name: "Ravi", college: "NIT Trichy", openedAt: at(3), opens: 1, clickedAt: at(3), clicks: 2, phone: "98765 43210" });
const meera = person("meera@x.in", { name: "Meera", clickedAt: at(4), clicks: 1, actions: [{ label: "Registered: Vicodathon", at: at(5), clicked: true }] });
const all = [asha, ravi, meera];

describe("source keys", () => {
  it("round-trip and reject junk", () => {
    expect(parseSourceKey(sourceKey({ kind: "campaign", id: "cmabc1234567" }))).toEqual({ kind: "campaign", id: "cmabc1234567" });
    expect(parseSourceKey("s:cmxyz9876543")).toEqual({ kind: "send", id: "cmxyz9876543" });
    expect(parseSourceKey("x:abc")).toBeNull();
    expect(parseSourceKey("c:'; drop table")).toBeNull();
    expect(parseSourceKey(undefined)).toBeNull();
  });
});

describe("selectPeople", () => {
  const ids = (list: EngagedPerson[]) => list.map((p) => p.name);

  it("filters by what people did", () => {
    expect(ids(selectPeople(all, { show: "clicked", q: "", sort: "name" }))).toEqual(["Meera", "Ravi"]);
    expect(ids(selectPeople(all, { show: "opened_only", q: "", sort: "name" }))).toEqual(["Asha"]);
    expect(ids(selectPeople(all, { show: "acted", q: "", sort: "name" }))).toEqual(["Meera"]);
  });

  it("searches name, email, college and phone", () => {
    expect(ids(selectPeople(all, { show: "all", q: "iit", sort: "name" }))).toEqual(["Asha"]);
    expect(ids(selectPeople(all, { show: "all", q: "98765", sort: "name" }))).toEqual(["Ravi"]);
    expect(ids(selectPeople(all, { show: "all", q: "MEERA@", sort: "name" }))).toEqual(["Meera"]);
  });

  it("puts Klymb actions, then clicks, then opens first by default", () => {
    expect(ids(selectPeople(all, { show: "all", q: "", sort: "engaged" }))).toEqual(["Meera", "Ravi", "Asha"]);
  });

  it("sorts missing colleges last", () => {
    expect(ids(selectPeople(all, { show: "all", q: "", sort: "college" }))).toEqual(["Asha", "Ravi", "Meera"]);
  });
});

describe("peopleCounts", () => {
  it("counts a click without a tracked open as opened", () => {
    expect(peopleCounts(all)).toEqual({ opened: 3, clicked: 2, acted: 1, total: 3 });
  });
});
