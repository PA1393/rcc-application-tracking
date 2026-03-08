import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/applications?roles=true          → distinct role list
// GET /api/applications?role=<role>         → all applications for that role
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("roles") === "true") {
    const rows = await prisma.application.findMany({
      select: { role: true },
      distinct: ["role"],
      orderBy: { role: "asc" },
    });
    return NextResponse.json(rows.map((r) => r.role));
  }

  const role = searchParams.get("role");
  if (!role) {
    return NextResponse.json({ error: "role param required" }, { status: 400 });
  }

  const applications = await prisma.application.findMany({
    where: { role },
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
