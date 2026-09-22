import { describe, expect, it } from "vitest";
import { addUtmToHtml } from "@/server/utm/rewrite";

const UTM = { source: "email", medium: "campaign", campaign: "freshers-drive" };

describe("addUtmToHtml", () => {
  it("adds utm params to absolute http links", () => {
    const html = `<a href="https://abtalks.in/register">Register</a>`;
    const out = addUtmToHtml(html, UTM);
    expect(out).toContain("utm_source=email");
    expect(out).toContain("utm_medium=campaign");
    expect(out).toContain("utm_campaign=freshers-drive");
  });

  it("preserves existing utm params", () => {
    const html = `<a href="https://abtalks.in/x?utm_source=custom&utm_campaign=other">click</a>`;
    const out = addUtmToHtml(html, UTM);
    expect(out).toContain("utm_source=custom");
    expect(out).toContain("utm_campaign=other");
    expect(out).toContain("utm_medium=campaign"); // filled in
  });

  it("does not touch mailto, tel, or fragment links", () => {
    const html = `<a href="mailto:x@y.z">m</a><a href="tel:+911234567890">t</a><a href="#top">a</a>`;
    const out = addUtmToHtml(html, UTM);
    expect(out).toBe(html);
  });

  it("leaves relative URLs untouched", () => {
    const html = `<a href="/register">r</a>`;
    expect(addUtmToHtml(html, UTM)).toBe(html);
  });

  it("handles single-quoted href", () => {
    const html = `<a href='https://abtalks.in/x'>x</a>`;
    const out = addUtmToHtml(html, UTM);
    expect(out).toContain("utm_campaign=freshers-drive");
    expect(out).toContain("'https://abtalks.in/x?");
  });
});
