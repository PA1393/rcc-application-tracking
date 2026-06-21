import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { auth } from "@/lib/auth";

type TimestampField = "interview_invite_sent" | "acceptance_sent_at" | "rejection_sent_at";

const STATUS_TO_FIELD: Record<string, TimestampField> = {
  Interviewing: "interview_invite_sent",
  Accepted:     "acceptance_sent_at",
  Rejected:     "rejection_sent_at",
};

const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 50_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CRLF stripping prevents subject/to from injecting additional SMTP headers.
function stripCrlf(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(text: string): string {
  return escapeHtml(text)
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// In-process per-user rate limit. Window: RATE_MAX sends per RATE_WINDOW_MS per
// signed-in user. Memory only — adequate for a single-instance internal ATS.
// If we ever scale to multiple nodes, move this to Redis/DB.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const sendLog = new Map<string, number[]>();

function checkRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const recent = (sendLog.get(userId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_MAX) {
    const oldest = recent[0];
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  sendLog.set(userId, recent);
  return { ok: true };
}

// Test-only hook. No-op in normal operation.
export function __resetRateLimitForTests() {
  sendLog.clear();
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const rate = checkRateLimit(session.user.id);
  if (!rate.ok) {
    return NextResponse.json(
      { error: `Too many emails sent. Try again in ${rate.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const payload = (await request.json()) as {
    applicationId?: unknown;
    subject?: unknown;
    body?: unknown;
    to?: unknown;
  };

  // ── Validate required fields ─────────────────────────────────────────────
  const applicationId = typeof payload.applicationId === "string" ? payload.applicationId.trim() : "";
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  const subject = typeof payload.subject === "string" ? payload.subject : "";
  if (!subject.trim()) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  }
  if (subject.length > MAX_SUBJECT_LEN) {
    return NextResponse.json(
      { error: `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.` },
      { status: 400 }
    );
  }

  const body = typeof payload.body === "string" ? payload.body : "";
  if (!body.trim()) {
    return NextResponse.json({ error: "Body is required." }, { status: 400 });
  }
  if (body.length > MAX_BODY_LEN) {
    return NextResponse.json(
      { error: `Body must be ${MAX_BODY_LEN} characters or fewer.` },
      { status: 400 }
    );
  }

  let toOverride: string | undefined;
  if (payload.to !== undefined) {
    const candidate = typeof payload.to === "string" ? payload.to.trim() : "";
    if (!EMAIL_RE.test(candidate)) {
      return NextResponse.json({ error: "Invalid recipient email address." }, { status: 400 });
    }
    toOverride = candidate;
  }

  // ── Fetch application + applicant ────────────────────────────────────────
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { applicant: true },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const timestampField = STATUS_TO_FIELD[application.status];
  if (!timestampField) {
    return NextResponse.json(
      { error: `No email defined for status: "${application.status}"` },
      { status: 400 }
    );
  }

  // Duplicate-send guard — preserved exactly.
  const alreadySentAt = application[timestampField] as Date | null;
  if (alreadySentAt) {
    return NextResponse.json(
      { error: "Email already sent", sentAt: alreadySentAt },
      { status: 409 }
    );
  }

  const rawTo = toOverride ?? application.applicant.preferred_email ?? application.applicant.email;

  // Final validation on resolved recipient (covers DB-stored emails too).
  if (!EMAIL_RE.test(rawTo)) {
    return NextResponse.json({ error: "Applicant has no valid email on file." }, { status: 400 });
  }

  // Sanitize header-sensitive fields right before send.
  const safeSubject = stripCrlf(subject);
  const safeTo = stripCrlf(rawTo);

  try {
    const info = await sendEmail({
      to: safeTo,
      subject: safeSubject,
      text: body,
      html: bodyToHtml(body),
    });

    // Only stamp the timestamp after a confirmed send.
    await prisma.application.update({
      where: { id: applicationId },
      data: { [timestampField]: new Date() },
    });

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
