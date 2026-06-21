type TemplateData = {
  name: string;
  role: string;
  opportunity: string;
};

type EmailTemplate = {
  subject: string;
  body: string;
};

function fill(template: string, data: TemplateData): string {
  return template
    .replace(/\{\{name\}\}/g, data.name)
    .replace(/\{\{role\}\}/g, data.role)
    .replace(/\{\{opportunity\}\}/g, data.opportunity);
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

export function getEmailTemplate(status: string, data: TemplateData): EmailTemplate {
  const template = TEMPLATES[status];
  if (!template) {
    throw new Error(`No email template for status: "${status}"`);
  }
  return {
    subject: fill(template.subject, data),
    body: fill(template.body, data),
  };
}
