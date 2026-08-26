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

// Matrix form has one column per role, all sharing AMBASSADOR_MATRIX_COLUMN_PREFIX.
// Detecting on this structural pattern instead of any free-text question means
// role additions or question rewordings can't break detection, and it fails in
// exactly the same place the normalizer fails if the prefix ever changes.
const MATRIX_COLUMN_DETECTION_THRESHOLD = 3;

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

  // Original-case headers for the structural matrix check (prefix is case-sensitive).
  const rawHeaders = Object.keys(rawData[0]);
  // Lower-cased headers for the exact-match signal checks.
  const headers = rawHeaders.map((h) => h.toLowerCase().trim());

  // E-Board MUST be checked before Ambassador — they share
  // "what position are you applying for?" as a header.
  // The unique signal "campaign video (1 minute)" disambiguates.
  if (EBOARD_SIGNALS.some((s) => headers.includes(s)))              return "eboard";

  // Matrix form: many headers share AMBASSADOR_MATRIX_COLUMN_PREFIX, one per role.
  // Threshold guards against a lone rewording that happens to reuse the phrasing.
  const matrixColumnCount = rawHeaders.filter((h) =>
    h.startsWith(AMBASSADOR_MATRIX_COLUMN_PREFIX)
  ).length;
  if (matrixColumnCount >= MATRIX_COLUMN_DETECTION_THRESHOLD)       return "ambassador_matrix";

  if (PROJECT_SIGNALS.some((s) => headers.includes(s)))             return "project";
  return "unknown";
}
