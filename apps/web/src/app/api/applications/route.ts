import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { acceptApplicant } from "@/lib/placement";
import { auth } from "@/lib/auth";
import { normalizeInterviewRoles } from "@/lib/interviewRoles";

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
