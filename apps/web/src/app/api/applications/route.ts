import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/applications?opportunities=true      → distinct opportunity list
// GET /api/applications?opportunity=<name>      → all applications for that opportunity
// GET /api/applications?roles=true              → distinct role list (legacy)
// GET /api/applications?applicantId=<id>        → all applications for one applicant
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("opportunities") === "true") {
    const rows = await prisma.application.findMany({
      select: { opportunity: true },
      distinct: ["opportunity"],
      orderBy: { opportunity: "asc" },
    });
    return NextResponse.json(rows.map((r) => r.opportunity).filter(Boolean));
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

// PATCH /api/applications  body: { id, status?, interview_notes? }
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, status, interview_notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updated = await prisma.application.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(interview_notes !== undefined && { interview_notes }),
    },
  });

  return NextResponse.json(updated);
}
