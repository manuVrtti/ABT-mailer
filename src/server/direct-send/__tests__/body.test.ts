import { describe, expect, it } from "vitest";
import {
  buildRowEmail,
  checkRows,
  detectColumns,
  fileMatches,
  matchFilesToPerson,
  fillVariables,
  htmlToText,
  isBlocking,
  looksLikeHtml,
  parseAttachmentNames,
  plainTextToHtml,
  toRows,
  variableKey,
} from "../body";
import { attachmentsForRow } from "../service";

describe("detectColumns", () => {
  it("finds the usual headers", () => {
    expect(detectColumns(["Email", "Name", "Subject", "Body", "Attachment"])).toEqual({
      email: "Email",
      name: "Name",
      subject: "Subject",
      body: "Body",
      attachment: "Attachment",
    });
  });

  it("handles other spellings", () => {
    expect(detectColumns(["Email ID", "Full Name", "Mail Subject", "Message", "Files"])).toEqual({
      email: "Email ID",
      name: "Full Name",
      subject: "Mail Subject",
      body: "Message",
      attachment: "Files",
    });
  });

  it("doesn't mistake short words inside other headers", () => {
    // "to" must not match "Photo"; "mail" must not make "Mail body" the email column.
    const m = detectColumns(["Photo", "Recipient Email", "Mail body", "subject"]);
    expect(m.email).toBe("Recipient Email");
    expect(m.body).toBe("Mail body");
    expect(m.attachment).toBeUndefined();
  });
});

describe("toRows / checkRows", () => {
  const records = [
    { Email: " Asha@Example.com ", Name: "Asha", Subject: "Offer, {{name}}", Body: "Hi {{name}}", College: "ABES", File: "offer.PDF" },
    { Email: "not-an-email", Name: "", Subject: "", Body: "x", College: "", File: "" },
    { Email: "asha@example.com", Name: "Asha 2", Subject: "Again", Body: "y", College: "", File: "" },
    { Email: "ravi@example.com", Name: "Ravi", Subject: "Hi", Body: "z", College: "", File: "missing.pdf; offer.pdf" },
  ];
  const map = { email: "Email", name: "Name", subject: "Subject", body: "Body", attachment: "File" };
  const rows = toRows(records, map);

  it("normalizes email and keeps every column as a variable", () => {
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      email: "asha@example.com",
      name: "Asha",
      attachmentNames: ["offer.PDF"],
    });
    expect(rows[0]!.variables).toMatchObject({ college: "ABES", name: "Asha", email: "asha@example.com" });
  });

  it("flags bad rows; file names match case-insensitively", () => {
    const issues = checkRows(rows, ["offer.pdf"]);
    expect(issues.get(1)).toEqual(["duplicate_email"]);
    expect(issues.get(2)).toEqual(expect.arrayContaining(["invalid_email", "no_subject"]));
    expect(issues.get(4)).toEqual(["missing_file"]);
    expect(isBlocking(issues.get(1))).toBe(false); // duplicates only warn
    expect(isBlocking(issues.get(4))).toBe(true);
  });
});

describe("attachmentsForRow", () => {
  const files = [
    { filename: "brochure.pdf", forAll: true },
    { filename: "Offer.pdf", forAll: false },
    { filename: "other.pdf", forAll: false },
  ];
  it("adds everyone-files plus the named ones, once each", () => {
    const r = attachmentsForRow(files, ["offer.PDF", "brochure.pdf", "nope.pdf"]);
    expect(r.files.map((f) => f.filename).sort()).toEqual(["Offer.pdf", "brochure.pdf"]);
    expect(r.missing).toEqual(["nope.pdf"]);
  });
});

describe("body → email", () => {
  it("fills variables, leaving unknown ones visible", () => {
    expect(fillVariables("Hi {{ name }}, {{college}} {{oops}}", { name: "<Asha>", college: "ABES" }, true)).toBe(
      "Hi &lt;Asha&gt;, ABES {{oops}}",
    );
  });

  it("turns plain text into paragraphs and links", () => {
    const html = plainTextToHtml("Hi Asha,\n\nJoin: https://meet.example.com/x.\nThanks");
    expect(html).toContain('<p style="margin:0 0 14px">Hi Asha,</p>');
    expect(html).toContain('<a href="https://meet.example.com/x"');
    expect(html).toContain("<br>Thanks");
  });

  it("uses HTML bodies as written", () => {
    expect(looksLikeHtml("<p>Hello</p>")).toBe(true);
    expect(looksLikeHtml("1 < 2 and 3 > 2")).toBe(false);
    const e = buildRowEmail({ subject: "Hi\n{{name}}", body: "<p>Dear {{name}}</p>", variables: { name: "A&B" } });
    expect(e.subject).toBe("Hi A&B");
    expect(e.html).toBe("<p>Dear A&amp;B</p>");
    expect(e.text).toBe("Dear A&B");
  });

  it("escapes plain-text bodies", () => {
    const e = buildRowEmail({ subject: "s", body: "<script>alert(1)</script> & co", variables: {} });
    expect(e.html).not.toContain("<script>");
    expect(e.text).toBe("<script>alert(1)</script> & co");
  });

  it("htmlToText keeps links readable", () => {
    expect(htmlToText('<p>See <a href="https://x.io">this</a></p><ul><li>One</li></ul>')).toBe("See this (https://x.io)\n• One");
  });
});

describe("fileMatches", () => {
  it("matches names written without the extension, ignoring case", () => {
    expect(fileMatches("klymb_cache_hit_miss", "klymb_cache_hit_miss.gif")).toBe(true);
    expect(
      fileMatches("suyashgupta_2200320130174__ab_resume_test_ (1)", "suyashgupta_2200320130174__AB_resume_test_ (1).pdf"),
    ).toBe(true);
    expect(fileMatches("Offer.PDF", "offer.pdf")).toBe(true);
  });

  it("doesn't match a different file or a different extension", () => {
    expect(fileMatches("offer.pdf", "offer.docx")).toBe(false);
    expect(fileMatches("offer", "offer-2.pdf")).toBe(false);
    expect(fileMatches("offer", "my offer.pdf")).toBe(false);
  });

  it("is what row checks and the sender use", () => {
    const rows = toRows([{ email: "a@b.co", subject: "s", body: "b", file: "klymb_cache_hit_miss" }], {
      email: "email",
      subject: "subject",
      body: "body",
      attachment: "file",
    });
    expect(checkRows(rows, ["klymb_cache_hit_miss.gif"]).get(1)).toBeUndefined();
    const r = attachmentsForRow([{ filename: "klymb_cache_hit_miss.gif", forAll: false }], ["klymb_cache_hit_miss"]);
    expect(r.files.map((f) => f.filename)).toEqual(["klymb_cache_hit_miss.gif"]);
    expect(r.missing).toEqual([]);
  });
});

describe("matchFilesToPerson", () => {
  const files = ["asha@gmail.com.pdf", "Ravi Kumar.pdf", "neha.sharma.docx", "brochure.pdf", "ab.pdf"];
  it("matches a file named after the email (keeping the .com)", () => {
    expect(matchFilesToPerson({ email: "asha@gmail.com", name: "" }, files)).toEqual(["asha@gmail.com.pdf"]);
  });
  it("matches the name, ignoring case and separators", () => {
    expect(matchFilesToPerson({ email: "r@x.io", name: "ravi kumar" }, files)).toEqual(["Ravi Kumar.pdf"]);
    expect(matchFilesToPerson({ email: "r@x.io", name: "Ravi_Kumar" }, files)).toEqual(["Ravi Kumar.pdf"]);
  });
  it("matches the part before the @", () => {
    expect(matchFilesToPerson({ email: "neha.sharma@college.edu", name: "N" }, files)).toEqual(["neha.sharma.docx"]);
  });
  it("never matches unrelated or too-short names", () => {
    expect(matchFilesToPerson({ email: "zz@x.io", name: "Someone" }, files)).toEqual([]);
    expect(matchFilesToPerson({ email: "ab@x.io", name: "" }, files)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("parses attachment cells", () => {
    expect(parseAttachmentNames(" a.pdf ; b.pdf|a.pdf\n")).toEqual(["a.pdf", "b.pdf"]);
    expect(parseAttachmentNames("")).toEqual([]);
  });
  it("makes variable keys", () => {
    expect(variableKey(" First Name ")).toBe("first_name");
    expect(variableKey("Graduation-Year (2026)")).toBe("graduation_year_2026");
  });
});
