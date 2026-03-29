import Papa from "papaparse";

//file is responsible for parsing and normalization of data

    export async function parseRawCsv(file: File): Promise<any[]> {
        const csvText = await file.text();



    const results = Papa.parse<any>(csvText, {
        header: true, // first row is header
        skipEmptyLines: true, //skip empty lines
        transformHeader: (header) => header.trim(), //remove whitespace from headers
    });

    return results.data;

    }



  export function normalizeData(rawData: any[], opportunity: string = ""): any[] {

  // Java: for(row : rawData) -> TS: .map()
  return rawData.map((row) => {
    const normalizedRow: any =
    {
      rawData: row,
      opportunity,        // stamp opportunity on every row
      status: "To Review",  // Default status for new imports
      track: "General"    // Default track (you can change this later)
     }; //clean object



    const emailVariations = ['sjsu email', 'email', 'email address', 'Email Address', 'SJSU Email Address'];
    const nameVariations = ['name', 'full name','Name (First Last)', 'Full Name (First Last)', 'Full Name (First and Last)', 'applicant name', "what is your first and last name?"]; //modify
    const roleVariations = ['role', 'position','Which project are you applying for?', 'what position are you applying for?', 'which role are you interested in?', 'Which Position Are You Interested In? Details on roles available!', 'Select the Position Youre Applying For']; //modify

    // Find which header in the row matches our list
    const rowHeaders = Object.keys(row);

    for (const variation of emailVariations) {
      const matchedHeader = rowHeaders.find(
        (header) => header.toLowerCase().trim() === variation.toLowerCase()
      );

      if (matchedHeader) {
        normalizedRow.email = row[matchedHeader].trim().toLowerCase();
        break; // found best email match
      }
    }

    //name variations
    for (const variation of nameVariations) {
        const matchedHeader = rowHeaders.find(
            (header) => header.toLowerCase().trim() === variation.toLowerCase()
        );

        if (matchedHeader) {
            normalizedRow.name = row[matchedHeader].trim();
            break;
        }
    }

    //role variations
    for (const variation of roleVariations) {
        const matchedHeader = rowHeaders.find(
            (header) => header.toLowerCase().trim() === variation.toLowerCase()
        );

        if (matchedHeader) {
            normalizedRow.role = row[matchedHeader].trim();
            break;
        }
    }

    // mark row invalid if essential fields are missing
    if (!normalizedRow.email || !normalizedRow.name) {
      normalizedRow._invalid = true;
      normalizedRow._reason = "Missing email or name";
    }

    return normalizedRow;

  });
}

// ── Ambassador normalizer ─────────────────────────────────────────────────────

const TEAM_ALIASES: Record<string, string> = {
  "consulting":           "Consulting Team",
  "industry relations":   "Industry Relations Team",
  "case competition":     "Case Competition Team",
  "membership outreach":  "Membership Outreach Team",
  "workshops":            "Workshops Team",
  "workshop":             "Workshops Team",
  "journalism":           "Journalism Team",
  "digital marketing":    "Digital Marketing Team",
  "graphic design":       "Graphic Design Team",
  "finance":              "Finance Team",
  "web development":      "Web Development Team",
  "wed development":      "Web Development Team",
  "growth analytics":     "Growth Analytics Team",
};

export function canonicalizeTeamName(rawName: string): string {
  // if the input is empty, just return an empty string — nothing to look up
  if (!rawName) return "";

  // make it lowercase and remove extra whitespace so the lookup is case-insensitive
  let cleaned = rawName.trim().toLowerCase();

  // people sometimes write "Finance Team" and sometimes just "Finance"
  // strip the word "team" from the end so both versions hit the same lookup key
  if (cleaned.endsWith(" team")) {
    cleaned = cleaned.slice(0, -5).trim();
  }

  // look up the cleaned string in the alias map
  // if found, return the official canonical name (e.g. "Finance Team")
  // if not found, return the original input trimmed — don't silently drop unknown values
  return TEAM_ALIASES[cleaned] ?? rawName.trim();
}

export function normalizeAmbassadorData(rawData: any[], opportunity: string): any[] {
  return rawData.map((row) => {
    const name = (row["Name (First Last)"] ?? "").trim();

    // Primary: SJSU Email, fallback: Email Address
    const sjsuEmail = (row["SJSU Email"] ?? "").trim().toLowerCase();
    const email = sjsuEmail || (row["Email Address"] ?? "").trim().toLowerCase();

    const preferred_name  = (row["Preferred Name"]  ?? "").trim();
    const preferred_email = (row["Preferred Email"] ?? "").trim();

    // Determine role from the position column
    const positionRaw = (row["What position are you applying for?"] ?? "").trim();
    const isLead = positionRaw.toLowerCase().includes("lead");
    const role = isLead ? "Lead Ambassador" : "Ambassador";

    // Read team preferences from the correct set of columns based on role
    const pref1Raw = isLead
      ? (row["Enter your #1 Lead Ambassador Team Preference:"] ?? "")
      : (row["Enter your #1 Ambassador Team Preference:"] ?? "");
    const pref2Raw = isLead
      ? (row["Enter your #2 Lead Ambassador Team Preference:"] ?? "")
      : (row["Enter your #2 Ambassador Team Preference:"] ?? "");
    // Lead Ambassadors have no #3 column
    const pref3Raw = isLead
      ? ""
      : (row["Enter your #3 Ambassador Team Preference:"] ?? "");

    const teamPreference1 = canonicalizeTeamName(pref1Raw);
    const teamPreference2 = canonicalizeTeamName(pref2Raw);
    const teamPreference3 = canonicalizeTeamName(pref3Raw);

    const normalized: any = {
      name,
      email,
      preferred_name,
      preferred_email,
      role,
      track: "Ambassador",
      status: "To Review",
      opportunity,
      teamPreference1,
      teamPreference2,
      teamPreference3,
      rawData: {
        ...row,
        _teamPreference1: teamPreference1,
        _teamPreference2: teamPreference2,
        _teamPreference3: teamPreference3,
      },
    };

    if (!name || !email) {
      normalized._invalid = true;
      normalized._reason = "Missing email or name";
    }

    return normalized;
  });
}

// ── Form type detection ───────────────────────────────────────────────────────

// Headers that only appear on the Ambassador Google Form
const AMBASSADOR_SIGNALS = [
  "what position are you applying for?",
  "enter your #1 ambassador team preference:",
  "enter your #1 lead ambassador team preference:",
  "what team(s) are you applying for as an ambassador?",
];

// Headers that only appear on Project / Intern Google Forms
const PROJECT_SIGNALS = [
  "which position are you interested in? details on roles available!",
  "which project are you applying for?",
  "select the position youre applying for",
  "sjsu email address",
];

export function detectCsvFormType(rawData: any[]): "ambassador" | "project" | "unknown" {
  if (!rawData.length) return "unknown";

  // Normalise headers from the first row for case-insensitive comparison
  const headers = Object.keys(rawData[0]).map((h) => h.toLowerCase().trim());

  if (AMBASSADOR_SIGNALS.some((s) => headers.includes(s))) return "ambassador";
  if (PROJECT_SIGNALS.some((s) => headers.includes(s)))    return "project";
  return "unknown";
}
