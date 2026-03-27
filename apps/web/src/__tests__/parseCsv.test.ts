import { describe, it, expect } from "vitest";
import { normalizeData } from "@/lib/parseCsv";

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
