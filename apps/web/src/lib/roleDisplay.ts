import { splitRoleValues } from "./interviewRoles";

// ── Role display names ────────────────────────────────────────────────────────
//
// Project and Consulting forms name a role with its full pitch, e.g.
// "LegalBee: Personalized Legal Information & Updates" or
// "Spartan OCLS (Web Platform, UI/UX & Community Infrastructure)". Every one of
// them puts the real name first and then a separator, so a short label is
// derivable rather than curated.
//
// This is a DISPLAY concern only. The stored Application.role keeps the full
// string: it is part of @@unique([applicant_id, role, season]) and both forms
// are already imported against live applicants.

// Verified against every distinct role value in the Project Group, Consulting
// and CDP Intern exports: the rule covers all ten with no collisions, so this
// map is empty. Add an entry keyed by the full stored value if a future form
// ships a name the rule cannot derive.
const ROLE_NAME_OVERRIDES: Record<string, string> = {};

// Ordered by nothing — the earliest occurrence in the string wins.
// Note " - " is an ASCII hyphen. The Ambassador and Consulting ranked-preference
// values use an en dash ("MMF – Social Media & Analytics Intern"), where the
// text after the dash is the role itself and must not be cut.
const ROLE_NAME_SEPARATORS = [":", " (", " - "];

export function shortenRoleName(value: string): string {
  const full = value.trim();
  if (!full) return "";

  const override = ROLE_NAME_OVERRIDES[full];
  if (override) return override;

  // index > 0 only: a value that opens with a separator has no name in front of
  // it, and cutting there would leave an empty label.
  const cuts = ROLE_NAME_SEPARATORS
    .map((sep) => full.indexOf(sep))
    .filter((i) => i > 0);

  if (cuts.length === 0) return full;
  return full.slice(0, Math.min(...cuts)).trim() || full;
}

// Ambassador role names are already short, and four of them are only
// distinguished by what follows a colon — "Hackathon Development: Web Dev" vs
// "…: Marketing" vs "…: Corporate Relations" vs "…: Event Operations". Applying
// the rule there would collapse four live roles into one label, so the track is
// part of the contract rather than something each call site must remember.
function isExemptTrack(track: string | null | undefined): boolean {
  return track === "Ambassador";
}

// One role cell may hold several values. Returns the short label for each.
export function shortenRoleValues(
  role: string | null | undefined,
  track?: string | null
): string[] {
  const values = splitRoleValues(role ?? "");
  return isExemptTrack(track) ? values : values.map(shortenRoleName);
}

// Display form of a whole role cell — short labels, comma-joined.
export function formatRoleForDisplay(
  role: string | null | undefined,
  track?: string | null
): string {
  return shortenRoleValues(role, track).join(", ");
}

// ── Interview role options ────────────────────────────────────────────────────
//
// What a reviewer may record as "interviewing for", derived from the applicant's
// own stored selections rather than a list per form. Used by the picker, the
// drag-to-Interviewing path, and the PATCH validation on the server, so client
// and server can never disagree about what is selectable.
//
//   Ambassador  → the ranked preferences the matrix form wrote to rawData
//                 (_teamPreference1/2/3), in rank order. Unchanged behaviour.
//   Everything  → each project in the role cell. The full string is the value
//   else          (it is what gets stored and validated); the label is short.
//
// Options are read at request time; nothing is written to rawData or role.

export type InterviewRoleOption = { value: string; label: string };

const RANK_PREFIX = ["1st", "2nd", "3rd"] as const;

export function getInterviewRoleOptions(app: {
  track: string;
  role: string;
  rawData: Record<string, unknown> | null | undefined;
}): InterviewRoleOption[] {
  if (isExemptTrack(app.track)) {
    const raw = app.rawData ?? {};
    const prefs = [raw._teamPreference1, raw._teamPreference2, raw._teamPreference3];
    const options: InterviewRoleOption[] = [];
    prefs.forEach((p, i) => {
      if (typeof p === "string" && p.trim()) {
        options.push({ value: p.trim(), label: `${RANK_PREFIX[i]}: ${p.trim()}` });
      }
    });
    return options;
  }

  return splitRoleValues(app.role).map((value) => ({
    value,
    label: shortenRoleName(value),
  }));
}
