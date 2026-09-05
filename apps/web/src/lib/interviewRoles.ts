export const MAX_INTERVIEW_ROLES = 3;
export const MAX_INTERVIEW_ROLE_LEN = 200;

export type NormalizeInterviewRolesResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

export function normalizeInterviewRoles(
  input: unknown
): NormalizeInterviewRolesResult {
  if (!Array.isArray(input) || input.some((r) => typeof r !== "string")) {
    return { ok: false, error: "interview_roles must be an array of strings." };
  }

  const cleaned: string[] = [];
  for (const raw of input as string[]) {
    const role = raw.trim();
    if (!role) continue;
    if (!cleaned.includes(role)) cleaned.push(role);
  }

  if (cleaned.some((r) => r.length > MAX_INTERVIEW_ROLE_LEN)) {
    return { ok: false, error: "Interview role names are too long." };
  }

  if (cleaned.length > MAX_INTERVIEW_ROLES) {
    return {
      ok: false,
      error: `At most ${MAX_INTERVIEW_ROLES} interview roles may be selected.`,
    };
  }

  return { ok: true, value: cleaned };
}

// A multi-select role question arrives as one comma-joined cell, e.g. the
// Project Group form's "select all that apply". The board filter and the email
// subject both need the individual values, so the split has one definition.
//
// Commas also occur *inside* project names — the Consulting form has
// "Musical Memories Foundation (Marketing, Multimedia & Outreach)" — so only a
// comma at bracket depth zero separates two values. An unbalanced opener leaves
// the remainder as a single value, which degrades to one over-long filter option
// rather than to several fragments of a name.
export function splitRoleValues(role: string): string[] {
  const values: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of role) {
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);

  return values.map((r) => r.trim()).filter(Boolean);
}

export function formatRoleList(roles: string[]): string {
  const cleaned = roles.map((r) => r.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}
