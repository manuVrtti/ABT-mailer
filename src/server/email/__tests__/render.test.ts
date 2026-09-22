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

  // Sanitization behavior is tested indirectly through the service's rendered
  // output; DOMPurify itself is well-covered upstream. We keep this unit level
  // focused on the substitution grammar.
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
