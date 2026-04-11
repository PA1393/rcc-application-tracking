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

// ── Ambassador matrix normalizer ──────────────────────────────────────────────
//
// The Lead & Ambassador Google Form exports one column per role, e.g.:
//   "Select the Position You're Applying For [Workshops Lead]"
//   "Select the Position You're Applying For [Case Lead]"
// Each cell contains "1st Preference", "2nd Preference", "3rd Preference", or empty.
// We scan all such columns in source order and assign the first match per slot.
// First-match-wins handles dirty historical rows where multiple cells share the same
// preference rank.

const AMBASSADOR_MATRIX_COLUMN_PREFIX = "Select the Position You're Applying For [";

export function normalizeAmbassadorMatrixData(rawData: any[], opportunity: string): any[] {
  return rawData.map((row) => {
    const name  = (row["Full Name (First Last)"] ?? "").trim();
    const email = (row["SJSU Email"] ?? "").trim().toLowerCase();

    let pref1 = "";
    let pref2 = "";
    let pref3 = "";

    // Iterate headers in column order so first match wins on duplicate preference markers
    for (const header of Object.keys(row)) {
      if (!header.startsWith(AMBASSADOR_MATRIX_COLUMN_PREFIX)) continue;

      // Extract role name from inside the trailing brackets
      const closeIdx = header.lastIndexOf("]");
      if (closeIdx === -1) continue;
      const roleName = header.slice(AMBASSADOR_MATRIX_COLUMN_PREFIX.length, closeIdx).trim();

      const cellValue = (row[header] ?? "").trim();
      if      (cellValue === "1st Preference" && !pref1) pref1 = roleName;
      else if (cellValue === "2nd Preference" && !pref2) pref2 = roleName;
      else if (cellValue === "3rd Preference" && !pref3) pref3 = roleName;
    }

    const normalized: any = {
      name,
      email,
      role: pref1,   // primary role = first preference
      track: "Ambassador",
      status: "To Review",
      opportunity,
      teamPreference1: pref1,
      teamPreference2: pref2,
      teamPreference3: pref3,
      rawData: {
        ...row,
        _teamPreference1: pref1,
        _teamPreference2: pref2,
        _teamPreference3: pref3,
      },
    };

    if (!name || !email) {
      normalized._invalid = true;
      normalized._reason  = "Missing email or name";
    }

    return normalized;
  });
}

export function normalizeEboardData(rawData: any[], opportunity: string): any[] {
  return rawData.map((row) => {
    const name  = (row["Full Name (First Last)"] ?? "").trim();
    const email = (row["SJSU Email"] ?? "").trim().toLowerCase();
    const role  = (row["Which position are you applying for?"] ?? "").trim();

    const normalized: any = {
      name,
      email,
      role,
      track: "Ambassador",   // E-Board is a subtype of the Ambassador track
      status: "To Review",
      opportunity,
      rawData: row,
    };

    if (!name || !email) {
      normalized._invalid = true;
      normalized._reason  = "Missing email or name";
    }

    return normalized;
  });
}

// ── Form type detection ───────────────────────────────────────────────────────

// Headers that only appear on the E-Board Google Form
const EBOARD_SIGNALS = [
  "campaign video (1 minute)",
];

// Header unique to the new Lead & Ambassador matrix Google Form.
// The portfolio question only appears on this form and is safe to use as the detection signal.
const AMBASSADOR_MATRIX_SIGNALS = [
  "if you are applying for graphic design lead or publicity vice president, please link your portfolio.",
];

// Headers that only appear on Project / Intern Google Forms
const PROJECT_SIGNALS = [
  "which position are you interested in? details on roles available!",
  "which project are you applying for?",
  "select the position youre applying for",
  "sjsu email address",
];

export function detectCsvFormType(
  rawData: any[]
): "eboard" | "ambassador_matrix" | "project" | "unknown" {
  if (!rawData.length) return "unknown";

  // Normalise headers from the first row for case-insensitive comparison
  const headers = Object.keys(rawData[0]).map((h) => h.toLowerCase().trim());

  // E-Board MUST be checked before Ambassador — they share
  // "what position are you applying for?" as a header.
  // The unique signal "campaign video (1 minute)" disambiguates.
  if (EBOARD_SIGNALS.some((s) => headers.includes(s)))              return "eboard";
  // Matrix form is detected by a question unique to that form.
  if (AMBASSADOR_MATRIX_SIGNALS.some((s) => headers.includes(s)))  return "ambassador_matrix";
  if (PROJECT_SIGNALS.some((s) => headers.includes(s)))             return "project";
  return "unknown";
}
