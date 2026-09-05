import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { reserveRateLimit } from "@/lib/emailRateLimit";
import {
  sendApplicationEmail,
  MAX_SUBJECT_LEN,
  MAX_BODY_LEN,
  EMAIL_RE,
  STATUS_TO_FIELD,
  stripCrlf,
} from "@/lib/emailService";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { formatRoleList } from "@/lib/interviewRoles";

export const maxDuration = 60; // Vercel Hobby ceiling

const MAX_BATCH = 10;

// Small fill helper — mirrors emailTemplates.ts's internal fill() without
// modifying that file. Used to apply per-recipient placeholders to override text.
function fill(
  template: string,
  data: { name: string; role: string; opportunity: string; roles?: string[] }
): string {
  return template
    .replace(/\{\{name\}\}/g, data.name)
    .replace(/\{\{role\}\}/g, data.role)
    .replace(/\{\{opportunity\}\}/g, data.opportunity)
    .replace(/\{\{roles\}\}/g, formatRoleList(data.roles ?? []));
}

type BulkEmailResult =
  | { id: string; ok: true; messageId: string }
  | { id: string; ok: false; skipped: string }
  | { id: string; ok: false; error: "server-error" };

// POST /api/applications/bulk-email
// Body: { ids: string[], subject?: string, body?: string }
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const payload = (await request.json()) as {
    ids?: unknown;
    subject?: unknown;
    body?: unknown;
  };

  // ── Validate ids ─────────────────────────────────────────────────────────
  if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array." }, { status: 400 });
  }
  if (payload.ids.length > MAX_BATCH) {
    return NextResponse.json(
      {
        error:
          `Batch too large: ${payload.ids.length} recipients requested, ` +
          `max ${MAX_BATCH} per call. Split into smaller batches.`,
        maxBatch: MAX_BATCH,
      },
      { status: 400 }
    );
  }

  // Dedupe, drop non-strings
  const uniqueIds: string[] = [
    ...new Set(payload.ids.filter((id): id is string => typeof id === "string")),
  ];

  // ── Validate optional subject/body overrides ──────────────────────────────
  const subjectOverride =
    typeof payload.subject === "string" ? payload.subject : undefined;
  const bodyOverride =
    typeof payload.body === "string" ? payload.body : undefined;

  if (subjectOverride !== undefined) {
    if (!subjectOverride.trim()) {
      return NextResponse.json({ error: "Subject must not be empty." }, { status: 400 });
    }
    if (subjectOverride.length > MAX_SUBJECT_LEN) {
      return NextResponse.json(
        { error: `Subject must be ${MAX_SUBJECT_LEN} characters or fewer.` },
        { status: 400 }
      );
    }
  }

  if (bodyOverride !== undefined) {
    if (!bodyOverride.trim()) {
      return NextResponse.json({ error: "Body must not be empty." }, { status: 400 });
    }
    if (bodyOverride.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `Body must be ${MAX_BODY_LEN} characters or fewer.` },
        { status: 400 }
      );
    }
  }

  // ── Rate-limit: reserve all slots up front or reject ──────────────────────
  // Note: slots reserved upfront are NOT refunded on per-row skip/failure.
  // This is intentional over-consumption accepted for simplicity.
  const rate = reserveRateLimit(session.user.id, uniqueIds.length);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: `Too many emails sent. Try again in ${rate.retryAfterSec}s.`,
        retryAfterSec: rate.retryAfterSec,
        remaining: rate.remaining,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  // ── Fetch all applications + applicants in one query ──────────────────────
  const fetched = await prisma.application.findMany({
    where: { id: { in: uniqueIds } },
    include: { applicant: true },
  });
  const fetchedMap = new Map(fetched.map((a) => [a.id, a]));

  // ── {{roles}} guard ──────────────────────────────────────────────────────
  // If the caller uses {{roles}} anywhere, an Interviewing recipient with an
  // empty interview_roles array would fill it to "" and produce a
  // grammatically broken sentence. Refuse the whole batch with the offending
  // names so the reviewer can either fix those applicants' roles or edit
  // {{roles}} out of the message. Rate-limit slots are already reserved and
  // not refunded here — matches the existing over-consumption policy above.
  const usesRolesPlaceholder =
    (subjectOverride?.includes("{{roles}}") ?? false) ||
    (bodyOverride?.includes("{{roles}}") ?? false);

  if (usesRolesPlaceholder) {
    const emptyRoleTargets = fetched.filter(
      (app) =>
        app.status === "Interviewing" &&
        (app.interview_roles?.length ?? 0) === 0
    );
    if (emptyRoleTargets.length > 0) {
      return NextResponse.json(
        {
          error:
            "Some selected applicants have no interview roles set, but the message uses {{roles}}. " +
            "Add roles to those applicants or remove {{roles}} from the message.",
          missingRoleIds: emptyRoleTargets.map((a) => a.id),
          missingRoleNames: emptyRoleTargets.map((a) => a.applicant.name),
        },
        { status: 400 }
      );
    }
  }

  // ── Process each id in input order ───────────────────────────────────────
  const results: BulkEmailResult[] = [];

  for (const id of uniqueIds) {
    const app = fetchedMap.get(id);

    // Not found
    if (!app) {
      results.push({ id, ok: false, skipped: "not-found" });
      continue;
    }

    // Wrong status
    if (app.status !== "Interviewing") {
      results.push({ id, ok: false, skipped: "wrong-status" });
      continue;
    }

    // Already sent (pre-check — sendApplicationEmail will also guard)
    if (app.interview_invite_sent) {
      results.push({ id, ok: false, skipped: "duplicate" });
      continue;
    }

    // Resolve recipient email
    const rawTo = app.applicant.preferred_email ?? app.applicant.email;
    if (!rawTo || !EMAIL_RE.test(rawTo)) {
      results.push({ id, ok: false, skipped: "no-email" });
      continue;
    }

    // Resolve subject & body — override with placeholder fill, or use template.
    // `roles` drives the {{roles}} placeholder and the roles-branch of the
    // Interviewing template (INTERVIEWING_BODY_WITH_ROLES); passing an empty
    // array preserves today's single-role behavior.
    const templateData = {
      name: app.applicant.name,
      role: app.role,
      opportunity: app.opportunity,
      roles: app.interview_roles ?? [],
      track: app.track,
    };

    let subject: string;
    let body: string;

    if (subjectOverride !== undefined || bodyOverride !== undefined) {
      // Use template as fallback for whichever isn't overridden
      const template = getEmailTemplate("Interviewing", templateData);
      subject = subjectOverride !== undefined
        ? fill(stripCrlf(subjectOverride), templateData)
        : template.subject;
      body = bodyOverride !== undefined
        ? fill(bodyOverride, templateData)
        : template.body;
    } else {
      const template = getEmailTemplate("Interviewing", templateData);
      subject = template.subject;
      body = template.body;
    }

    // Verify status field exists (should always be true for "Interviewing")
    if (!STATUS_TO_FIELD[app.status]) {
      results.push({ id, ok: false, skipped: "wrong-status" });
      continue;
    }

    // Delegate actual send + stamp to shared helper
    const sendResult = await sendApplicationEmail({
      applicationId: id,
      subject,
      body,
      to: rawTo,
    });

    if (sendResult.ok) {
      results.push({ id, ok: true, messageId: sendResult.messageId });
    } else if (sendResult.reason === "duplicate") {
      // Race case: stamped between our check and the send
      results.push({ id, ok: false, skipped: "duplicate" });
    } else {
      results.push({ id, ok: false, error: "server-error" });
    }
  }

  return NextResponse.json({ results });
}
