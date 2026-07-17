import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { reserveRateLimit } from "@/lib/emailRateLimit";
import {
  sendApplicationEmail,
  MAX_SUBJECT_LEN,
  MAX_BODY_LEN,
  EMAIL_RE,
} from "@/lib/emailService";

// Re-export so email.test.ts can import __resetRateLimitForTests from this path unchanged.
export { __resetRateLimitForTests } from "@/lib/emailRateLimit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  // Rate-limit check — consumes 1 slot on every allowed attempt (same as before).
  const rate = reserveRateLimit(session.user.id, 1);
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

  // ── Delegate to shared send helper ──────────────────────────────────────
  const result = await sendApplicationEmail({
    applicationId,
    subject,
    body,
    to: toOverride,
  });

  if (result.ok) {
    return NextResponse.json({ success: true, messageId: result.messageId });
  }

  switch (result.reason) {
    case "not-found":
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    case "wrong-status":
      return NextResponse.json(
        { error: `No email defined for status: "${result.detail}"` },
        { status: 400 }
      );
    case "duplicate":
      return NextResponse.json(
        { error: "Email already sent", sentAt: result.sentAt },
        { status: 409 }
      );
    case "no-email":
      return NextResponse.json({ error: "Applicant has no valid email on file." }, { status: 400 });
    case "invalid-subject":
    case "invalid-body":
      // Should not reach here (pre-validated above), but map defensively.
      return NextResponse.json({ error: "Invalid subject or body." }, { status: 400 });
    case "server-error":
      return NextResponse.json(
        { success: false, error: result.detail ?? "Unknown error" },
        { status: 500 }
      );
  }
}
