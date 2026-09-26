import { describe, expect, it } from "vitest";
import { detectColumns, extractContact, isHeaderless } from "@/lib/csv-columns";

describe("detectColumns", () => {
  it("maps Brevo/Google-Sheets style headers", () => {
    const m = detectColumns(["First Name", "Last Name", "Email Address", "College"], []);
    expect(m).toMatchObject({ firstName: 0, lastName: 1, email: 2, college: 3 });
  });

  it("maps a single full-name column", () => {
    const m = detectColumns(["Name", "Email"], []);
    expect(m).toMatchObject({ fullName: 0, email: 1 });
  });

  it("matches looser headers like 'Student Email ID'", () => {
    const m = detectColumns(["Student Email ID", "Candidate First Name"], []);
    expect(m.email).toBe(0);
    expect(m.firstName).toBe(1);
  });

  it("sniffs the email column when the header is unrecognised", () => {
    const m = detectColumns(["Contact", "Whatever"], [["Asha", "asha@x.com"], ["Ravi", "ravi@y.in"]]);
    expect(m.email).toBe(1);
  });
});

describe("extractContact", () => {
  it("splits a full name into first and last", () => {
    const c = extractContact(["Suyash Kumar Gupta", "SUYASH@Gmail.com "], { fullName: 0, email: 1 });
    expect(c).toMatchObject({ email: "suyash@gmail.com", firstName: "Suyash", lastName: "Kumar Gupta" });
  });

  it("returns null for rows without a valid email", () => {
    expect(extractContact(["Asha", "not-an-email"], { firstName: 0, email: 1 })).toBeNull();
  });
});

describe("isHeaderless", () => {
  it("detects a data row in the first line", () => {
    expect(isHeaderless(["Asha", "asha@x.com"])).toBe(true);
    expect(isHeaderless(["name", "email"])).toBe(false);
  });
});
