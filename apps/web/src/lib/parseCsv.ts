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



// ── Header matching ───────────────────────────────────────────────────────────
//
// Headers used to be matched by exact equality against a hand-kept list, first
// list entry wins. That failed two ways: a reworded header matched nothing and
// fell through to role="Unknown" silently, and on a form with several plausible
// columns the list order decided the winner rather than the column's specificity.
// Matching is now by specificity, and an unmatched role column is a hard error.

// Google Forms headers carry smart apostrophes, embedded newlines and doubled
// spaces. Normalize once so every matcher below compares the same shape.
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Applicants are deduped by email, so the institutional address has to win over
// any other contact column on the same form. The Consulting form carries three:
// "Email Address" (Google auto-collected, often personal), "SJSU Email Address",
// and "Preferred / Personal Email".
const EMAIL_SCORE_INSTITUTIONAL = 100;
const EMAIL_SCORE_GENERIC = 50;

// A column naming some address other than the applicant's identity. Storing one
// of these as the email forks the applicant into a second record.
const EMAIL_DISQUALIFIERS = [
  "preferred", "personal", "alternate", "alternative", "secondary", "parent", "guardian",
];
const EMAIL_INSTITUTIONAL_TOKENS = ["sjsu", "school", "university", "campus"];

function scoreEmailHeader(header: string): number {
  const h = normalizeHeader(header);
  if (!h.includes("email") && !h.includes("e-mail")) return 0;
  if (EMAIL_DISQUALIFIERS.some((t) => h.includes(t))) return 0;
  if (EMAIL_INSTITUTIONAL_TOKENS.some((t) => h.includes(t))) return EMAIL_SCORE_INSTITUTIONAL;
  return EMAIL_SCORE_GENERIC;
}

// Highest score wins; ties go to the leftmost column, since Papa preserves CSV
// column order in Object.keys.
export function findEmailHeader(rowHeaders: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const header of rowHeaders) {
    const score = scoreEmailHeader(header);
    if (score > bestScore) {
      bestScore = score;
      best = header;
    }
  }
  return best;
}

// Tier A: headers we have actually seen. Exact (normalized) match, so a form we
// already know keeps matching deterministically rather than through the pattern.
const ROLE_KNOWN_HEADERS = [
  'role',
  'position',
  'Which project are you applying for?',
  'what position are you applying for?',
  'which role are you interested in?',
  'Which Position Are You Interested In? Details on roles available!',
  "Select the Position You're Applying For",
];

const ROLE_TIER_KNOWN = 300;
const ROLE_TIER_PATTERN = 200;

// Tier B: the shape of a role question rather than its exact wording. The
// leading interrogative is what does the work — plain keyword containment
// false-positives on real headers that merely mention a project or a role,
// e.g. "Skills:  LegalBee\nWhat skills … most relevant to this project?
// (select all that apply …)", "Would you be interested in serving as the
// Project Lead for Lucid?", "Primary Role Preference (1st Choice)" and
// "Role Fit & Experience\nPlease respond once per role you are applying to".
const ROLE_NOUNS = ["role", "position", "project"];
const ROLE_APPLY_VERBS = ["applying", "apply for", "interested in"];
const ROLE_SELECT_VERBS = ["applying", "apply for"];

function scoreRoleHeader(header: string): number {
  const h = normalizeHeader(header);

  // The Ambassador matrix ships one bracketed column per role, e.g.
  // "Select the Position You're Applying For [Workshops Lead]", which satisfies
  // the "select" anchor below. Those belong to normalizeAmbassadorMatrixData.
  if (h.endsWith("]")) return 0;

  if (ROLE_KNOWN_HEADERS.some((v) => normalizeHeader(v) === h)) return ROLE_TIER_KNOWN;

  const hasNoun = ROLE_NOUNS.some((n) => h.includes(n));
  if (!hasNoun) return 0;

  if (h.startsWith("which") && ROLE_APPLY_VERBS.some((v) => h.includes(v))) return ROLE_TIER_PATTERN;
  if (h.startsWith("select") && ROLE_SELECT_VERBS.some((v) => h.includes(v))) return ROLE_TIER_PATTERN;

  return 0;
}

export type RoleHeaderMatch = {
  header: string | null;
  tier: number;
  // Other headers that matched at the same tier. The leftmost wins; these are
  // surfaced in the import summary so an ambiguous form is visible.
  ambiguousWith: string[];
};

// Exported so /api/import can reject a file whose role column it cannot identify
// before any row is written, and warn when more than one column could be it.
export function resolveRoleHeader(rowHeaders: string[]): RoleHeaderMatch {
  let best: string | null = null;
  let bestScore = 0;
  const tied: string[] = [];

  for (const header of rowHeaders) {
    const score = scoreRoleHeader(header);
    if (score === 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = header;
      tied.length = 0;
    } else if (score === bestScore) {
      tied.push(header);
    }
  }

  return { header: best, tier: bestScore, ambiguousWith: tied };
}

export function findRoleHeader(rowHeaders: string[]): string | null {
  return resolveRoleHeader(rowHeaders).header;
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



    const nameVariations = ['name', 'full name','Name (First Last)', 'Full Name (First Last)', 'Full Name (First and Last)', 'applicant name', "what is your first and last name?"]; //modify

    // Find which header in the row matches our list
    const rowHeaders = Object.keys(row);

    const emailHeader = findEmailHeader(rowHeaders);
    if (emailHeader) {
      normalizedRow.email = (row[emailHeader] ?? "").trim().toLowerCase();

      // Never demote to a less specific column when the institutional one is
      // blank on this row. Falling back is exactly how a personal address ends
      // up as an applicant's identity and forks them into a second record.
      if (!normalizedRow.email && scoreEmailHeader(emailHeader) === EMAIL_SCORE_INSTITUTIONAL) {
        normalizedRow._invalid = true;
        normalizedRow._reason = `Blank "${emailHeader}" — refusing to fall back to another email column`;
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

    //role
    const roleHeader = findRoleHeader(rowHeaders);
    if (roleHeader) {
        normalizedRow.role = (row[roleHeader] ?? "").trim();
    }

    // mark row invalid if essential fields are missing.
    // Guarded so a more specific reason set above is not overwritten.
    if (!normalizedRow._invalid && (!normalizedRow.email || !normalizedRow.name)) {
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
