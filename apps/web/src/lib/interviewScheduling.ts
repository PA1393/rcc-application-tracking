import { formatRoleForDisplay } from "./roleDisplay";

// ── Interview scheduling links ────────────────────────────────────────────────
//
// Consulting interviews are booked by the applicant on the project team's
// Calendly. Keys are the exact full project strings — the same values stored in
// interview_roles — so a stored role resolves to its link without any
// transformation. Ambassador and Project Group roles are not keys, so those
// emails never get a scheduling block and render exactly as before.

const CALENDLY_BY_PROJECT: Record<string, string> = {
  "AI Valley (Front-End & UI/UX Consulting)":
    "https://calendly.com/sarahkhadder/new-meeting",
  "Musical Memories Foundation (Marketing, Multimedia & Outreach)":
    "https://calendly.com/harika-bkc/30min",
  "Spartan OCLS (Web Platform, UI/UX & Community Infrastructure)":
    "https://calendly.com/sowmika374/30min?month=2026-09",
};

// What the Interviewing body said before scheduling links existed. Every
// applicant whose roles carry no link still gets exactly this sentence.
export const SCHEDULING_FOLLOW_UP =
  "We'll follow up shortly with scheduling details. In the meantime, please don't hesitate to reach out if you have any questions.";

const UNMAPPED_LINE = "Your interviewer will follow up with you directly to schedule.";

export function hasSchedulingLinks(roles: string[]): boolean {
  return roles.some((r) => r.trim() in CALENDLY_BY_PROJECT);
}

// One line per project the applicant is interviewing for, short name plus
// link. With more than one project the applicant must book every one — these
// are separate interviews with different teams, not a choice — and the lead-in
// says so. A project with no link gets a follow-up line rather than a blank.
export function buildSchedulingBlock(roles: string[], track?: string | null): string {
  const selected = roles.map((r) => r.trim()).filter(Boolean);
  if (!hasSchedulingLinks(selected)) return SCHEDULING_FOLLOW_UP;

  const lines = selected.map((full) => {
    const name = formatRoleForDisplay(full, track);
    const url = CALENDLY_BY_PROJECT[full];
    return url ? `${name} — ${url}` : `${name} — ${UNMAPPED_LINE}`;
  });

  const leadIn =
    selected.length > 1
      ? "These are separate interviews with different teams, so please book a time with each of them:"
      : "Please book a time with the team here:";

  return `${leadIn}\n\n${lines.join("\n")}\n\nIf you have any questions, please don't hesitate to reach out.`;
}
