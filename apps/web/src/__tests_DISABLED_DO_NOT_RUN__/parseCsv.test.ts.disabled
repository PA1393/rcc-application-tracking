import { describe, it, expect } from "vitest";
import { normalizeData, normalizeEboardData, normalizeAmbassadorMatrixData } from "@/lib/parseCsv";

describe("normalizeData", () => {
  it("maps standard headers correctly", () => {
    const rows = [{ Email: "alice@sjsu.edu", "Full Name": "Alice Wong", Role: "Marketing Intern" }];
    const [result] = normalizeData(rows, "Creative Destination Program");

    expect(result.email).toBe("alice@sjsu.edu");
    expect(result.name).toBe("Alice Wong");
    expect(result.role).toBe("Marketing Intern");
    expect(result.opportunity).toBe("Creative Destination Program");
    expect(result._invalid).toBeUndefined();
  });

  it("maps fuzzy SJSU-style headers", () => {
    const rows = [
      {
        "SJSU Email Address": "Bob@SJSU.EDU",
        "Full Name (First Last)": "Bob Kim",
        "Which Position Are You Interested In? Details on roles available!": "Web Dev Intern",
      },
    ];
    const [result] = normalizeData(rows, "Credo AI");

    // email is lowercased by normalizeData
    expect(result.email).toBe("bob@sjsu.edu");
    expect(result.name).toBe("Bob Kim");
    expect(result.role).toBe("Web Dev Intern");
    expect(result._invalid).toBeUndefined();
  });

  it("stamps opportunity onto every row", () => {
    const rows = [
      { Email: "carol@sjsu.edu", "Full Name": "Carol Lee", Role: "Designer" },
      { Email: "dan@sjsu.edu", "Full Name": "Dan Park", Role: "Engineer" },
    ];
    const results = normalizeData(rows, "Creative Destination Program");

    expect(results[0].opportunity).toBe("Creative Destination Program");
    expect(results[1].opportunity).toBe("Creative Destination Program");
  });

  it("flags row as invalid when email is missing", () => {
    const rows = [{ "Full Name": "Eve Chen", Role: "Marketing Intern" }];
    const [result] = normalizeData(rows, "Test Opp");

    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("flags row as invalid when name is missing", () => {
    const rows = [{ Email: "frank@sjsu.edu", Role: "Marketing Intern" }];
    const [result] = normalizeData(rows, "Test Opp");

    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("handles extra and unknown headers without breaking", () => {
    const rows = [
      {
        Email: "grace@sjsu.edu",
        "Full Name": "Grace Xu",
        Role: "Designer",
        Timestamp: "3/1/2025 10:00:00",
        "Favorite Color": "Blue",
        "Random Column": "Some value",
      },
    ];
    const [result] = normalizeData(rows, "Some Program");

    expect(result.email).toBe("grace@sjsu.edu");
    expect(result.name).toBe("Grace Xu");
    expect(result.role).toBe("Designer");
    expect(result._invalid).toBeUndefined();
  });
});

describe("normalizeAmbassadorMatrixData", () => {
  const OPPORTUNITY = "Lead & Ambassador Recruitment 2026";

  // A realistic matrix row with one column per role
  const FULL_ROW: Record<string, string> = {
    "Full Name (First Last)": "Alice Chen",
    "SJSU Email": "Alice.Chen@sjsu.edu",
    "Select the Position You're Applying For [Workshops Lead]":    "2nd Preference",
    "Select the Position You're Applying For [Case Lead]":         "1st Preference",
    "Select the Position You're Applying For [Consulting Lead]":   "3rd Preference",
    "Select the Position You're Applying For [Finance Ambassador]": "",
    "If you are applying for Graphic Design Lead or Publicity Vice President, please link your portfolio.": "",
  };

  it("extracts name, email, and all three preferences in order", () => {
    const [result] = normalizeAmbassadorMatrixData([FULL_ROW], OPPORTUNITY);

    expect(result.name).toBe("Alice Chen");
    expect(result.email).toBe("alice.chen@sjsu.edu"); // lowercased
    expect(result.teamPreference1).toBe("Case Lead");
    expect(result.teamPreference2).toBe("Workshops Lead");
    expect(result.teamPreference3).toBe("Consulting Lead");
  });

  it("sets role to the first preference", () => {
    const [result] = normalizeAmbassadorMatrixData([FULL_ROW], OPPORTUNITY);
    expect(result.role).toBe("Case Lead");
  });

  it("sets track to 'Ambassador'", () => {
    const [result] = normalizeAmbassadorMatrixData([FULL_ROW], OPPORTUNITY);
    expect(result.track).toBe("Ambassador");
  });

  it("sets status to 'To Review'", () => {
    const [result] = normalizeAmbassadorMatrixData([FULL_ROW], OPPORTUNITY);
    expect(result.status).toBe("To Review");
  });

  it("stamps opportunity onto every row", () => {
    const row2 = { ...FULL_ROW, "SJSU Email": "other@sjsu.edu" };
    const results = normalizeAmbassadorMatrixData([FULL_ROW, row2], OPPORTUNITY);
    expect(results[0].opportunity).toBe(OPPORTUNITY);
    expect(results[1].opportunity).toBe(OPPORTUNITY);
  });

  it("mirrors preferences into rawData _teamPreference keys", () => {
    const [result] = normalizeAmbassadorMatrixData([FULL_ROW], OPPORTUNITY);
    expect(result.rawData._teamPreference1).toBe("Case Lead");
    expect(result.rawData._teamPreference2).toBe("Workshops Lead");
    expect(result.rawData._teamPreference3).toBe("Consulting Lead");
  });

  it("handles a row with only one preference column filled", () => {
    const row: Record<string, string> = {
      "Full Name (First Last)": "Bob Park",
      "SJSU Email": "bob@sjsu.edu",
      "Select the Position You're Applying For [Finance Ambassador]": "1st Preference",
    };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result.teamPreference1).toBe("Finance Ambassador");
    expect(result.teamPreference2).toBe("");
    expect(result.teamPreference3).toBe("");
    expect(result._invalid).toBeUndefined();
  });

  it("handles a row with no preferences filled (pref1 empty, not invalid)", () => {
    const row: Record<string, string> = {
      "Full Name (First Last)": "Carol Kim",
      "SJSU Email": "carol@sjsu.edu",
      "Select the Position You're Applying For [Workshops Lead]": "",
    };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result.teamPreference1).toBe("");
    expect(result.role).toBe("");
    expect(result._invalid).toBeUndefined(); // only name/email gate _invalid
  });

  it("flags row invalid when email is missing", () => {
    const row = { ...FULL_ROW, "SJSU Email": "" };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("flags row invalid when name is missing", () => {
    const row = { ...FULL_ROW, "Full Name (First Last)": "" };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("first-match-wins on duplicate preference markers (dirty historical rows)", () => {
    // Two columns both marked "1st Preference" — the first one in column order wins
    const row: Record<string, string> = {
      "Full Name (First Last)": "Dan Lee",
      "SJSU Email": "dan@sjsu.edu",
      "Select the Position You're Applying For [Workshops Lead]":  "1st Preference",
      "Select the Position You're Applying For [Case Lead]":       "1st Preference", // duplicate — ignored
      "Select the Position You're Applying For [Consulting Lead]": "2nd Preference",
    };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result.teamPreference1).toBe("Workshops Lead"); // first column wins
    expect(result.teamPreference2).toBe("Consulting Lead");
    expect(result.teamPreference3).toBe("");
  });

  it("ignores non-matrix columns (does not pick up unrelated headers)", () => {
    const row: Record<string, string> = {
      "Full Name (First Last)": "Eve Xu",
      "SJSU Email": "eve@sjsu.edu",
      "Timestamp": "3/1/2026 10:00:00",
      "Select the Position You're Applying For [Growth Analytics Ambassador]": "1st Preference",
    };
    const [result] = normalizeAmbassadorMatrixData([row], OPPORTUNITY);
    expect(result.teamPreference1).toBe("Growth Analytics Ambassador");
    expect(result.teamPreference2).toBe("");
  });
});

describe("normalizeEboardData", () => {
  const OPPORTUNITY = "E-Board Elections 2026";

  const FULL_ROW = {
    "Full Name (First Last)": "Jane Doe",
    "SJSU Email": "Jane.Doe@sjsu.edu",
    "Which position are you applying for?": "President",
    "Candidate Bio": "I love SJSU.",
    "Campaign Video (1 minute)": "https://youtu.be/abc123",
  };

  it("maps E-Board headers to normalized fields", () => {
    const [result] = normalizeEboardData([FULL_ROW], OPPORTUNITY);

    expect(result.name).toBe("Jane Doe");
    expect(result.email).toBe("jane.doe@sjsu.edu"); // lowercased
    expect(result.role).toBe("President");
    expect(result.opportunity).toBe(OPPORTUNITY);
    expect(result._invalid).toBeUndefined();
  });

  it("sets track to 'Ambassador' (E-Board is an Ambassador subtype)", () => {
    const [result] = normalizeEboardData([FULL_ROW], OPPORTUNITY);
    expect(result.track).toBe("Ambassador");
  });

  it("sets status to 'To Review'", () => {
    const [result] = normalizeEboardData([FULL_ROW], OPPORTUNITY);
    expect(result.status).toBe("To Review");
  });

  it("preserves rawData on the normalized row", () => {
    const [result] = normalizeEboardData([FULL_ROW], OPPORTUNITY);
    expect(result.rawData).toBe(FULL_ROW);
  });

  it("flags row invalid when email is missing", () => {
    const row = { ...FULL_ROW, "SJSU Email": "" };
    const [result] = normalizeEboardData([row], OPPORTUNITY);
    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("flags row invalid when name is missing", () => {
    const row = { ...FULL_ROW, "Full Name (First Last)": "" };
    const [result] = normalizeEboardData([row], OPPORTUNITY);
    expect(result._invalid).toBe(true);
    expect(result._reason).toMatch(/missing/i);
  });

  it("stamps opportunity onto every row", () => {
    const rows = [FULL_ROW, { ...FULL_ROW, "SJSU Email": "other@sjsu.edu" }];
    const results = normalizeEboardData(rows, OPPORTUNITY);
    expect(results[0].opportunity).toBe(OPPORTUNITY);
    expect(results[1].opportunity).toBe(OPPORTUNITY);
  });

  it("handles a missing role column gracefully (role is empty string, not _invalid)", () => {
    const { "Which position are you applying for?": _dropped, ...rowNoRole } = FULL_ROW;
    const [result] = normalizeEboardData([rowNoRole], OPPORTUNITY);
    expect(result.role).toBe("");
    expect(result._invalid).toBeUndefined();
  });
});
