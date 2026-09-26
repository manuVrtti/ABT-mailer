import { describe, expect, it } from "vitest";
import { renderTemplate, extractVariables, assertRequiredVariables, MissingVariableError } from "@/server/email/render";

describe("renderTemplate", () => {
  it("substitutes simple variables and HTML-escapes by default", () => {
    const out = renderTemplate("Hi {{name}}", { name: "<b>Alice</b>" });
    expect(out).toBe("Hi &lt;b&gt;Alice&lt;/b&gt;");
  });

  it("applies default fallback when variable is missing or empty", () => {
    expect(renderTemplate('Hi {{name | default: "there"}}', {})).toBe("Hi there");
    expect(renderTemplate('Hi {{name | default: "there"}}', { name: "" })).toBe("Hi there");
    expect(renderTemplate('Hi {{name | default: "there"}}', { name: "Priya" })).toBe("Hi Priya");
  });

  it("leaves unknown tokens untouched in non-strict mode", () => {
    expect(renderTemplate("Hi {{unknown}}", {})).toBe("Hi {{unknown}}");
  });

  it("throws in strict mode when a variable is missing", () => {
    expect(() => renderTemplate("Hi {{name}}", {}, { strict: true })).toThrow(MissingVariableError);
  });

  it("understands Brevo-style contact tokens and spaced default filters", () => {
    const tpl = 'Hi {{ contact.FIRSTNAME | default : "there" }},';
    expect(renderTemplate(tpl, { first_name: "Suyash" })).toBe("Hi Suyash,");
    expect(renderTemplate(tpl, { first_name: "" })).toBe("Hi there,");
    expect(renderTemplate(tpl, {})).toBe("Hi there,");
  });

  it("accepts HTML-encoded quotes around the default", () => {
    expect(renderTemplate("Hi {{ contact.FIRSTNAME | default : &quot;there&quot; }}", {})).toBe("Hi there");
  });

  it("keeps design markup but strips executable content when sanitizing", () => {
    const html =
      '<head><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"><style>.pill{letter-spacing:2px;text-transform:uppercase}</style></head>' +
      '<p class="pill" onclick="alert(1)">x</p><script>alert(1)</script><a href="javascript:alert(1)">y</a>';
    const out = renderTemplate(html, {}, { sanitize: true });
    expect(out).toContain("<link");
    expect(out).toContain("text-transform:uppercase");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
  });
});

describe("extractVariables", () => {
  it("returns unique variable names", () => {
    const vars = extractVariables("Hi {{a}} and {{b}} and {{a}}");
    expect(vars.sort()).toEqual(["a", "b"]);
  });
});

describe("assertRequiredVariables", () => {
  it("throws MissingVariableError with the offending variable", () => {
    try {
      assertRequiredVariables(["a", "b"], { a: "x" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingVariableError);
      expect((err as MissingVariableError).variable).toBe("b");
    }
  });

  it("accepts numbers and non-empty strings", () => {
    expect(() => assertRequiredVariables(["a", "b"], { a: "x", b: 0 })).not.toThrow();
  });
});
