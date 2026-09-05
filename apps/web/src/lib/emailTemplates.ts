import { formatRoleList, splitRoleValues } from "./interviewRoles";
import { formatRoleForDisplay } from "./roleDisplay";

type TemplateData = {
  name: string;
  role: string;
  opportunity: string;
  roles?: string[];
  // Gates role-name shortening. Ambassador role names are already short and
  // several are only distinguished by their suffix, so they are left whole.
  track?: string | null;
};

type EmailTemplate = {
  subject: string;
  body: string;
};

type FilledData = {
  name: string;
  role: string;
  opportunity: string;
  roles: string;
};

function fill(template: string, data: FilledData): string {
  return template
    .replace(/\{\{name\}\}/g, data.name)
    .replace(/\{\{role\}\}/g, data.role)
    .replace(/\{\{opportunity\}\}/g, data.opportunity)
    .replace(/\{\{roles\}\}/g, data.roles);
}

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  Interviewing: {
    subject: "Interview Invitation — {{role}} at RCC",
    body: `Hi {{name}},

Thank you for your interest in the {{role}} position through RCC's {{opportunity}}. We were impressed by your application and would like to invite you to interview.

We'll follow up shortly with scheduling details. In the meantime, please don't hesitate to reach out if you have any questions.

Best,
RCC Recruiting Team`,
  },

  Accepted: {
    subject: "Congratulations! You've been selected — {{role}} at RCC",
    body: `Hi {{name}},

We're excited to let you know that you've been selected for the {{role}} position through RCC's {{opportunity}}. Congratulations!

We'll be in touch soon with next steps. Welcome to the team!

Best,
RCC Recruiting Team`,
  },

  Rejected: {
    subject: "Application Update — {{opportunity}}",
    body: `Hi {{name}},

Thank you for applying for the {{role}} position through RCC's {{opportunity}}. We truly appreciate the time you put into your application.

After careful review, we've decided to move forward with other candidates for this role. We encourage you to apply again in future recruitment cycles.

Best,
RCC Recruiting Team`,
  },
};

// Used instead of the standard Interviewing subject/body when the reviewer
// selected specific roles. Named-role placeholders live only here so they
// can never reach a caller that asks for an unfilled template.
const INTERVIEWING_SUBJECT_WITH_ROLES = "Interview Invitation — {{opportunity}}";
const INTERVIEWING_BODY_WITH_ROLES = `Hi {{name}},

Thank you for your interest in RCC's {{opportunity}}. We were impressed by your application and would like to invite you to interview for {{roles}}.

We'll follow up shortly with scheduling details. In the meantime, please don't hesitate to reach out if you have any questions.

Best,
RCC Recruiting Team`;

// A multi-select role cell holds every project the applicant picked. Spelled out
// in a subject line that overruns MAX_SUBJECT_LEN (200) and the send is rejected
// as invalid-subject — a five-project applicant produces 222 chars for
// Interviewing and 239 for Accepted. Name the opportunity instead, the same way
// the interview-roles branch already does. Keyed on the role splitting into more
// than one value rather than on a character count, so the subject line has a
// predictable shape instead of changing form at an arbitrary length.
// Rejected already names the opportunity and needs no variant.
const MULTI_ROLE_SUBJECTS: Record<string, string> = {
  Interviewing: INTERVIEWING_SUBJECT_WITH_ROLES,
  Accepted: "Congratulations! You've been selected — {{opportunity}}",
};

export function getEmailTemplate(status: string, data: TemplateData): EmailTemplate {
  const template = TEMPLATES[status];
  if (!template) {
    throw new Error(`No email template for status: "${status}"`);
  }

  const selected = (data.roles ?? []).map((r) => r.trim()).filter(Boolean);
  const useRoles = status === "Interviewing" && selected.length > 0;

  const filled: FilledData = {
    name: data.name,
    // Applicants picked these names off the form, so the short label is the
    // part they recognise: "the LegalBee position", not the full pitch.
    // interview_roles (selected[0]) are Ambassador-only and stay whole.
    role: useRoles ? selected[0] : formatRoleForDisplay(data.role, data.track),
    opportunity: data.opportunity,
    roles: formatRoleList(selected),
  };

  // Bodies are not length-bound (MAX_BODY_LEN is 50,000) and keep the full list.
  const multiRole = splitRoleValues(data.role ?? "").length > 1;
  const subjectTemplate = useRoles
    ? INTERVIEWING_SUBJECT_WITH_ROLES
    : (multiRole && MULTI_ROLE_SUBJECTS[status]) || template.subject;

  return {
    subject: fill(subjectTemplate, filled),
    body:    fill(useRoles ? INTERVIEWING_BODY_WITH_ROLES : template.body, filled),
  };
}
