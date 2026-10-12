import { describe, expect, it } from "vitest";
import { EmailCategory, SuppressionReason } from "@prisma/client";
import { domainOf, pickBrand, senderBrand, sendableDefault, type BrandInfo } from "@/server/brands";
import { decideSuppression } from "@/server/email/suppression";

const brand = (over: Partial<BrandInfo>): BrandInfo => ({
  key: "x",
  name: "X",
  domain: "x.com",
  fromName: "X",
  fromAddresses: [],
  replyTo: null,
  websiteUrl: null,
  isDefault: false,
  sesVerified: true,
  ...over,
});

const klymb = brand({ key: "klymb", name: "Klymb", domain: "klymb.ai", isDefault: true, fromAddresses: ["team@klymb.ai"] });
const abtalks = brand({ key: "abtalks", name: "ABTalks", domain: "abtalks.in", fromAddresses: ["team@abtalks.in"] });
const pending = brand({ key: "new", name: "New", domain: "new.io", sesVerified: false });
const brands = [klymb, abtalks, pending];

describe("brand lookup", () => {
  it("finds the brand by the From address domain, case-insensitively", () => {
    expect(domainOf(" Team@Klymb.AI ")).toBe("klymb.ai");
    expect(pickBrand(brands, "no-reply@abtalks.in").key).toBe("abtalks");
  });

  it("falls back to the default brand", () => {
    expect(pickBrand(brands, "someone@elsewhere.com").key).toBe("klymb");
    expect(pickBrand(brands, null).key).toBe("klymb");
  });

  it("never sends as an unverified default", () => {
    const unverifiedDefault = [{ ...klymb, sesVerified: false }, abtalks];
    expect(sendableDefault(unverifiedDefault).key).toBe("abtalks");
    expect(sendableDefault(brands).key).toBe("klymb");
  });

  it("allows any address on a verified domain, nothing on an unverified one", () => {
    expect(senderBrand(brands, "no-reply@klymb.ai")?.key).toBe("klymb");
    expect(senderBrand(brands, "hello@new.io")).toBeNull();
    expect(senderBrand(brands, "a@gmail.com")).toBeNull();
  });
});

describe("brand-scoped suppression", () => {
  const row = (reason: SuppressionReason, category: EmailCategory, brandKey: string) => ({ reason, category, brandKey });

  it("an ABTalks unsubscribe blocks ABTalks marketing only", () => {
    const rows = [row(SuppressionReason.UNSUBSCRIBE, EmailCategory.MARKETING, "abtalks")];
    expect(decideSuppression(rows, EmailCategory.MARKETING, "abtalks").allowed).toBe(false);
    expect(decideSuppression(rows, EmailCategory.MARKETING, "klymb").allowed).toBe(true);
  });

  it("a complaint about Klymb doesn't block ABTalks", () => {
    const rows = [row(SuppressionReason.COMPLAINT, EmailCategory.TRANSACTIONAL_NONESSENTIAL, "klymb")];
    expect(decideSuppression(rows, EmailCategory.MARKETING, "klymb").allowed).toBe(false);
    expect(decideSuppression(rows, EmailCategory.MARKETING, "abtalks").allowed).toBe(true);
  });

  it("a hard bounce blocks every brand, essential mail included", () => {
    const rows = [row(SuppressionReason.HARD_BOUNCE, EmailCategory.MARKETING, "")];
    expect(decideSuppression(rows, EmailCategory.TRANSACTIONAL_ESSENTIAL, "klymb").allowed).toBe(false);
    expect(decideSuppression(rows, EmailCategory.MARKETING, "abtalks").allowed).toBe(false);
  });

  it("without a brand, every row counts", () => {
    const rows = [row(SuppressionReason.UNSUBSCRIBE, EmailCategory.MARKETING, "abtalks")];
    expect(decideSuppression(rows, EmailCategory.MARKETING).allowed).toBe(false);
  });
});
