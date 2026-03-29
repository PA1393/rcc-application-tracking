import { canonicalizeTeamName, normalizeAmbassadorData } from "@/lib/parseCsv";
import { describe, expect, it } from "vitest";

// Reusable base row so individual tests only override what they're testing
const BASE_AMBASSADOR_ROW = {
  "Name (First Last)": "John Doe",
  "SJSU Email": "john@sjsu.edu",
  "Email Address": "",
  "Preferred Name": "",
  "Preferred Email": "",
  "What position are you applying for?": "Ambassador",
  "Enter your #1 Ambassador Team Preference:": "Finance",
  "Enter your #2 Ambassador Team Preference:": "",
  "Enter your #3 Ambassador Team Preference:": "",
  "Enter your #1 Lead Ambassador Team Preference:": "",
  "Enter your #2 Lead Ambassador Team Preference:": "",
};

// ── canonicalizeTeamName ──────────────────────────────────────────────────────

describe("canonicalizeTeamName", () => {
  it("maps full canonical name to itself", () => {
    expect(canonicalizeTeamName("Finance Team")).toBe("Finance Team");
  });

  it("maps short variant to canonical name", () => {
    expect(canonicalizeTeamName("Finance")).toBe("Finance Team");
  });

  it("handles case insensitivity", () => {
    expect(canonicalizeTeamName("DIGITAL MARKETING")).toBe("Digital Marketing Team");
  });

  it("handles common typos", () => {
    expect(canonicalizeTeamName("Wed Development")).toBe("Web Development Team");
  });

  it("handles variant with lowercase 'team' suffix", () => {
    expect(canonicalizeTeamName("membership outreach team")).toBe("Membership Outreach Team");
  });

  it("handles 'Workshop' vs 'Workshops' variants", () => {
    expect(canonicalizeTeamName("Workshop")).toBe("Workshops Team");
  });

  it("returns trimmed original for unknown team names", () => {
    expect(canonicalizeTeamName("  Some New Team  ")).toBe("Some New Team");
  });

  it("handles empty string", () => {
    expect(canonicalizeTeamName("")).toBe("");
  });
});

// ── normalizeAmbassadorData ───────────────────────────────────────────────────

describe("normalizeAmbassadorData", () => {
  it("normalizes a standard Ambassador row", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Name (First Last)": "John Doe",
        "SJSU Email": "JOHN.DOE@sjsu.edu",
        "What position are you applying for?": "Ambassador",
        "Enter your #1 Ambassador Team Preference:": "Finance",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "Mozilla Student Ambassador FA25");

    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john.doe@sjsu.edu"); // lowercased
    expect(result.role).toBe("Ambassador");
    expect(result.track).toBe("Ambassador");
    expect(result.status).toBe("To Review");
    expect(result.opportunity).toBe("Mozilla Student Ambassador FA25");
    expect(result.teamPreference1).toBe("Finance Team"); // canonicalized from "Finance"
    expect(result._invalid).toBeUndefined();
  });

  it("normalizes a Lead Ambassador row using lead preference columns", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "What position are you applying for?": "Lead Ambassador",
        "Enter your #1 Lead Ambassador Team Preference:": "Consulting",
        "Enter your #2 Lead Ambassador Team Preference:": "Journalism",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25 Lead");

    expect(result.role).toBe("Lead Ambassador");
    expect(result.teamPreference1).toBe("Consulting Team");
    expect(result.teamPreference2).toBe("Journalism Team");
    // Lead Ambassadors have no #3 column — must be empty string, never undefined
    expect(result.teamPreference3).toBe("");
  });

  it("falls back to Email Address when SJSU Email is empty", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "SJSU Email": "",
        "Email Address": "fallback@gmail.com",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result.email).toBe("fallback@gmail.com");
  });

  it("flags row as invalid when name is missing", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Name (First Last)": "",
        "SJSU Email": "test@sjsu.edu",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("flags row as invalid when both email fields are missing", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Name (First Last)": "Jane",
        "SJSU Email": "",
        "Email Address": "",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result._invalid).toBe(true);
  });

  it("stamps opportunity on every row", () => {
    const rows = [{ ...BASE_AMBASSADOR_ROW }, { ...BASE_AMBASSADOR_ROW }];
    const results = normalizeAmbassadorData(rows, "Test Program");

    expect(results[0].opportunity).toBe("Test Program");
    expect(results[1].opportunity).toBe("Test Program");
  });

  it("merges canonicalized preferences into rawData as helper fields", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Enter your #1 Ambassador Team Preference:": "Finance",
        "Enter your #2 Ambassador Team Preference:": "Consulting",
        "Enter your #3 Ambassador Team Preference:": "Journalism",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result.rawData._teamPreference1).toBe("Finance Team");
    expect(result.rawData._teamPreference2).toBe("Consulting Team");
    expect(result.rawData._teamPreference3).toBe("Journalism Team");
  });

  it("preserves preferred_name and preferred_email", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Preferred Name": "Johnny",
        "Preferred Email": "johnny@gmail.com",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result.preferred_name).toBe("Johnny");
    expect(result.preferred_email).toBe("johnny@gmail.com");
  });

  it("handles multiple rows and returns array of same length", () => {
    const rows = [
      { ...BASE_AMBASSADOR_ROW },
      { ...BASE_AMBASSADOR_ROW, "SJSU Email": "row2@sjsu.edu" },
      { ...BASE_AMBASSADOR_ROW, "SJSU Email": "row3@sjsu.edu" },
    ];
    const results = normalizeAmbassadorData(rows, "FA25");

    expect(results).toHaveLength(3);
  });

  it("canonicalizes team preferences with typos", () => {
    const rows = [
      {
        ...BASE_AMBASSADOR_ROW,
        "Enter your #1 Ambassador Team Preference:": "Wed Development",
      },
    ];
    const [result] = normalizeAmbassadorData(rows, "FA25");

    expect(result.teamPreference1).toBe("Web Development Team");
  });
});
