import { describe, expect, it } from "vitest";
import {
  assertSendAs,
  canEditTemplate,
  canSendAs,
  canUseTemplate,
  fromEmailWhere,
  sendableSenders,
  templateWhere,
  type SenderScope,
} from "../filters";
import type { BrandInfo } from "@/server/brands";

const brand = (key: string, domain: string, verified = true): BrandInfo => ({
  key,
  name: key[0]!.toUpperCase() + key.slice(1),
  domain,
  fromName: key,
  fromAddresses: [`team@${domain}`, `no-reply@${domain}`],
  replyTo: null,
  websiteUrl: null,
  isDefault: false,
  sesVerified: verified,
});
const klymb = brand("klymb", "klymb.ai");
const abtalks = brand("abtalks", "abtalks.in");

const everyone: SenderScope = { all: true, brands: [klymb, abtalks] };
const klymbOnly: SenderScope = { all: false, brands: [klymb], brandKeys: ["klymb"], domains: ["klymb.ai"] };
const nobody: SenderScope = { all: false, brands: [], brandKeys: [], domains: [] };

describe("sender access", () => {
  it("allows only the person's domains, ignoring case", () => {
    expect(canSendAs(klymbOnly, "team@klymb.ai")).toBe(true);
    expect(canSendAs(klymbOnly, "No-Reply@KLYMB.AI")).toBe(true);
    expect(canSendAs(klymbOnly, "no-reply@abtalks.in")).toBe(false);
    // A look-alike domain is not the brand.
    expect(canSendAs(klymbOnly, "x@notklymb.ai")).toBe(false);
    expect(canSendAs(everyone, "anything@abtalks.in")).toBe(true);
    expect(() => assertSendAs(klymbOnly, "no-reply@abtalks.in")).toThrow(/don't have access/);
  });

  it("builds a where that matches only those domains", () => {
    expect(fromEmailWhere(everyone)).toEqual({});
    expect(fromEmailWhere(klymbOnly)).toEqual({ OR: [{ fromEmail: { endsWith: "@klymb.ai", mode: "insensitive" } }] });
    // No brands at all: a filter that can never match, not "no filter".
    expect(fromEmailWhere(nobody)).toEqual({ OR: [{ fromEmail: { equals: "\u0000no-access" } }] });
  });

  it("shows shared templates plus the person's brands; edits only their brands", () => {
    expect(templateWhere(everyone)).toEqual({});
    expect(templateWhere(klymbOnly)).toEqual({ OR: [{ brandKey: null }, { brandKey: { in: ["klymb"] } }] });
    expect(canUseTemplate(klymbOnly, { brandKey: null })).toBe(true);
    expect(canUseTemplate(klymbOnly, { brandKey: "klymb" })).toBe(true);
    expect(canUseTemplate(klymbOnly, { brandKey: "abtalks" })).toBe(false);
    expect(canEditTemplate(klymbOnly, { brandKey: null })).toBe(false);
    expect(canEditTemplate(klymbOnly, { brandKey: "klymb" })).toBe(true);
    expect(canEditTemplate(everyone, { brandKey: null })).toBe(true);
  });

  it("offers only verified senders of the person's brands", () => {
    expect(sendableSenders(klymbOnly).map((s) => s.email)).toEqual(["team@klymb.ai", "no-reply@klymb.ai"]);
    const unverified: SenderScope = { all: false, brands: [brand("new", "new.io", false)], brandKeys: ["new"], domains: ["new.io"] };
    expect(sendableSenders(unverified)).toEqual([]);
  });
});
