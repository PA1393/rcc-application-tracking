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
