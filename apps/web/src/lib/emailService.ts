import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// ── Constants & helpers (identical behavior to originals in email/route.ts) ────

export const MAX_SUBJECT_LEN = 200;
export const MAX_BODY_LEN = 50_000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TimestampField = "interview_invite_sent" | "acceptance_sent_at" | "rejection_sent_at";

export const STATUS_TO_FIELD: Record<string, TimestampField> = {
  Interviewing: "interview_invite_sent",
  Accepted:     "acceptance_sent_at",
  Rejected:     "rejection_sent_at",
};

// CRLF stripping prevents subject/to from injecting additional SMTP headers.
export function stripCrlf(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function bodyToHtml(text: string): string {
  return escapeHtml(text)
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ── Discriminated result type ─────────────────────────────────────────────────

export type SendResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "not-found"
        | "wrong-status"
        | "duplicate"
        | "no-email"
        | "invalid-subject"
        | "invalid-body"
        | "server-error";
      detail?: string;
      sentAt?: Date;
    };

// ── Core send helper ──────────────────────────────────────────────────────────

/**
 * Sends an email for a given application and stamps the timestamp field.
 * Does NOT check rate limits — callers must do that before calling this.
 */
export async function sendApplicationEmail(params: {
  applicationId: string;
  subject: string;
  body: string;
  to?: string;
}): Promise<SendResult> {
  const { applicationId, subject, body } = params;

  // Validate subject & body (defensive — callers should pre-validate)
  if (!subject.trim()) return { ok: false, reason: "invalid-subject" };
  if (subject.length > MAX_SUBJECT_LEN) return { ok: false, reason: "invalid-subject" };
  if (!body.trim()) return { ok: false, reason: "invalid-body" };
  if (body.length > MAX_BODY_LEN) return { ok: false, reason: "invalid-body" };

  // Validate override `to` if provided
  let toOverride: string | undefined;
  if (params.to !== undefined) {
    const candidate = params.to.trim();
    if (!EMAIL_RE.test(candidate)) return { ok: false, reason: "no-email" };
    toOverride = candidate;
  }

  // Fetch application + applicant
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { applicant: true },
  });

  if (!application) return { ok: false, reason: "not-found" };

  const timestampField = STATUS_TO_FIELD[application.status];
  if (!timestampField) return { ok: false, reason: "wrong-status", detail: application.status };

  // Duplicate-send guard
  const alreadySentAt = application[timestampField] as Date | null;
  if (alreadySentAt) return { ok: false, reason: "duplicate", sentAt: alreadySentAt };

  const rawTo = toOverride ?? application.applicant.preferred_email ?? application.applicant.email;

  if (!EMAIL_RE.test(rawTo)) return { ok: false, reason: "no-email" };

  // Sanitize header-sensitive fields right before send
  const safeSubject = stripCrlf(subject);
  const safeTo = stripCrlf(rawTo);

  try {
    const info = await sendEmail({
      to: safeTo,
      subject: safeSubject,
      text: body,
      html: bodyToHtml(body),
    });

    // Only stamp the timestamp after a confirmed send
    await prisma.application.update({
      where: { id: applicationId },
      data: { [timestampField]: new Date() },
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, reason: "server-error", detail: (error as Error).message };
  }
}
