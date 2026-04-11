import { describe, it, expect } from "vitest";
import { detectCsvFormType } from "@/lib/parseCsv";

// detectCsvFormType inspects the headers of the first row of parsed CSV data and
// returns "ambassador", "project", or "unknown". All tests pass raw row objects —
// no real CSV files or PapaParse involved.

describe("detectCsvFormType", () => {
  it("returns 'ambassador' when the row contains an ambassador-specific header", () => {
    const rows = [{ "What position are you applying for?": "Ambassador" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("returns 'ambassador' when the row contains the ambassador team preference header", () => {
    const rows = [{ "Enter your #1 Ambassador Team Preference:": "Finance" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("returns 'ambassador' when the row contains the lead ambassador preference header", () => {
    const rows = [{ "Enter your #1 Lead Ambassador Team Preference:": "Consulting" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("returns 'project' when the row contains a project-specific header", () => {
    // "SJSU Email Address" (with 'Address') is a project-form signal
    const rows = [{ "SJSU Email Address": "user@sjsu.edu", "Full Name": "Test User" }];
    expect(detectCsvFormType(rows)).toBe("project");
  });

  it("returns 'project' when the row contains the 'Which project are you applying for?' header", () => {
    const rows = [{ "Which project are you applying for?": "Credo AI" }];
    expect(detectCsvFormType(rows)).toBe("project");
  });

  it("returns 'unknown' when headers don't match any known signal", () => {
    const rows = [{ "Random Column": "some value", "Another Field": "other value" }];
    expect(detectCsvFormType(rows)).toBe("unknown");
  });

  it("returns 'unknown' for an empty data array", () => {
    // No rows means no headers to inspect — cannot determine type
    expect(detectCsvFormType([])).toBe("unknown");
  });

  it("detection is case-insensitive (header casing does not matter)", () => {
    // Headers are lowercased+trimmed before comparison inside the function
    const rows = [{ "WHAT POSITION ARE YOU APPLYING FOR?": "Ambassador" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("detection trims whitespace from headers", () => {
    // PapaParse trims headers, but the function itself also lowercases+trims
    const rows = [{ "  what position are you applying for?  ": "Ambassador" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("only inspects the first row — extra rows with different headers are ignored", () => {
    // First row has no signal; second row has one — should still return 'unknown'
    // because only row[0] is checked
    const rows = [
      { "Random": "value" },
      { "What position are you applying for?": "Ambassador" },
    ];
    expect(detectCsvFormType(rows)).toBe("unknown");
  });

  // ── Ambassador matrix detection ───────────────────────────────────────────

  it("returns 'ambassador_matrix' when the row contains the portfolio question header", () => {
    const rows = [{
      "Full Name (First Last)": "Jane Doe",
      "SJSU Email": "jane@sjsu.edu",
      "If you are applying for Graphic Design Lead or Publicity Vice President, please link your portfolio.": "",
      "Select the Position You're Applying For [Workshops Lead]": "1st Preference",
    }];
    expect(detectCsvFormType(rows)).toBe("ambassador_matrix");
  });

  it("ambassador_matrix detection is case-insensitive", () => {
    const rows = [{
      "IF YOU ARE APPLYING FOR GRAPHIC DESIGN LEAD OR PUBLICITY VICE PRESIDENT, PLEASE LINK YOUR PORTFOLIO.": "",
    }];
    expect(detectCsvFormType(rows)).toBe("ambassador_matrix");
  });

  it("ambassador_matrix detection trims whitespace from headers", () => {
    const rows = [{
      "  if you are applying for graphic design lead or publicity vice president, please link your portfolio.  ": "",
    }];
    expect(detectCsvFormType(rows)).toBe("ambassador_matrix");
  });

  it("does NOT return 'ambassador_matrix' for the old ambassador form (no portfolio header)", () => {
    const rows = [{ "What position are you applying for?": "Ambassador" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  // ── E-Board detection ──────────────────────────────────────────────────────

  it("returns 'eboard' when the row contains the campaign video header", () => {
    const rows = [{ "Campaign Video (1 minute)": "https://youtu.be/example" }];
    expect(detectCsvFormType(rows)).toBe("eboard");
  });

  it("returns 'eboard' even when the row also contains an ambassador signal header", () => {
    // Critical ordering test: E-Board forms share "Which position are you applying for?"
    // with Ambassador forms. E-Board must win because it is checked first.
    const rows = [{
      "Campaign Video (1 minute)": "https://youtu.be/example",
      "Which position are you applying for?": "President",
    }];
    expect(detectCsvFormType(rows)).toBe("eboard");
  });

  it("returns 'ambassador' (not 'eboard') for an ambassador form without the campaign video header", () => {
    const rows = [{ "What position are you applying for?": "Ambassador" }];
    expect(detectCsvFormType(rows)).toBe("ambassador");
  });

  it("eboard detection is case-insensitive", () => {
    const rows = [{ "CAMPAIGN VIDEO (1 MINUTE)": "https://youtu.be/example" }];
    expect(detectCsvFormType(rows)).toBe("eboard");
  });

  it("eboard detection trims whitespace from headers", () => {
    const rows = [{ "  campaign video (1 minute)  ": "https://youtu.be/example" }];
    expect(detectCsvFormType(rows)).toBe("eboard");
  });
});
