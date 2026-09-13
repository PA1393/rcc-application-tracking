import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { acceptApplicant } from "@/lib/placement";
import { auth } from "@/lib/auth";
import { normalizeInterviewRoles } from "@/lib/interviewRoles";
import { getInterviewRoleOptions } from "@/lib/roleDisplay";
import { DELETE_APPLICATION_PHRASE, matchesDeletePhrase } from "@/lib/deleteConfirmation";

// GET /api/applications?opportunities=true      → distinct opportunity list
// GET /api/applications?opportunity=<name>      → all applications for that opportunity
// GET /api/applications?roles=true              → distinct role list (legacy)
// GET /api/applications?applicantId=<id>        → all applications for one applicant
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get("opportunities") === "true") {
    try {
      const rows = await prisma.application.findMany({
        select: { opportunity: true },
        distinct: ["opportunity"],
        orderBy: { opportunity: "asc" },
      });
      return NextResponse.json(rows.map((r) => r.opportunity).filter(Boolean));
    } catch {
      return NextResponse.json([]);
    }
  }

  if (searchParams.get("roles") === "true") {
    const rows = await prisma.application.findMany({
      select: { role: true },
      distinct: ["role"],
      orderBy: { role: "asc" },
    });
    return NextResponse.json(rows.map((r) => r.role));
  }

  const applicantId = searchParams.get("applicantId");
  if (applicantId) {
    const applications = await prisma.application.findMany({
      where: { applicant_id: applicantId },
      include: { applicant: { select: { name: true, email: true } } },
      orderBy: { applied_at: "asc" },
    });
    return NextResponse.json(applications);
  }

  const opportunity = searchParams.get("opportunity");
  if (!opportunity) {
    return NextResponse.json({ error: "opportunity param required" }, { status: 400 });
  }

  const applications = await prisma.application.findMany({
    where: { opportunity },
    include: { applicant: { select: { name: true, email: true } } },
    orderBy: { applied_at: "asc" },
  });

  return NextResponse.json(applications);
}

// PATCH /api/applications  body: { id, status?, interview_notes?, application_notes?, decision_notes?, interview_roles? }
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json();
  const { id, status, interview_notes, application_notes, decision_notes, interview_roles } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let normalizedRoles: string[] | undefined;
  if (interview_roles !== undefined) {
    // The Accepted branch routes to acceptApplicant(), which would silently drop this field.
    if (status === "Accepted") {
      return NextResponse.json(
        { error: "interview_roles cannot be set while accepting an applicant." },
        { status: 400 }
      );
    }
    const result = normalizeInterviewRoles(interview_roles);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    normalizedRoles = result.value;

    // Guardrail: interview roles must be among the applicant's own recorded
    // options — ranked preferences for Ambassador rows, the projects in the
    // role cell for everything else. The UI already constrains this, but a
    // hand-crafted request could still submit any string. Skipped for the
    // empty case (clearing roles is always allowed).
    if (normalizedRoles.length > 0) {
      const row = await prisma.application.findUnique({
        where: { id },
        select: { track: true, rawData: true, role: true },
      });
      if (!row) {
        return NextResponse.json({ error: "Application not found." }, { status: 404 });
      }
      const allowed = new Set(
        getInterviewRoleOptions({
          track: row.track,
          role: row.role,
          rawData: (row.rawData ?? null) as Record<string, unknown> | null,
        }).map((o) => o.value)
      );
      // E-Board rows carry the Ambassador track but no ranked preferences, so
      // they land here — the same 400 they received before via the membership
      // check below, now with a reason that names the cause.
      if (allowed.size === 0) {
        return NextResponse.json(
          { error: "This application has no recorded role options." },
          { status: 400 }
        );
      }
      const invalid = normalizedRoles.filter((r) => !allowed.has(r));
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            error:
              "Interview roles must be among the applicant's recorded options.",
            invalidRoles: invalid,
            allowedRoles: [...allowed],
          },
          { status: 400 }
        );
      }
    }
  }

  const updated =
    status === "Accepted"
      ? await acceptApplicant(id)
      : await prisma.application.update({
          where: { id },
          data: {
            ...(status !== undefined && { status }),
            ...(interview_notes !== undefined && { interview_notes }),
            ...(application_notes !== undefined && { application_notes }),
            ...(decision_notes !== undefined && { decision_notes }),
            ...(normalizedRoles !== undefined && { interview_roles: normalizedRoles }),
          },
        });

  return NextResponse.json(updated);
}

// DELETE /api/applications  body: { id, confirmation }
// Removes a single application row. The Applicant row is intentionally left in
// place: applicants are reused by email on re-import, and may own placements
// from other tracks.
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json();
  const { id, confirmation } = body;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (!matchesDeletePhrase(confirmation)) {
    return NextResponse.json(
      { error: `Confirmation phrase must be exactly: "${DELETE_APPLICATION_PHRASE}"` },
      { status: 400 }
    );
  }

  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  // Placement rows key on applicant_id + track + season and hold no reference to
  // the application, so deleting an accepted one would orphan the placement.
  if (existing.status === "Accepted") {
    return NextResponse.json(
      {
        error:
          "Accepted applications cannot be deleted because a placement record may depend on them. Delete is only allowed for non-accepted applications.",
      },
      { status: 409 }
    );
  }

  await prisma.application.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
