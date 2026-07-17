import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/opportunities → sorted distinct list of opportunity names
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const rows = await prisma.application.findMany({
    select: { opportunity: true },
    distinct: ["opportunity"],
    orderBy: { opportunity: "asc" },
  });

  return NextResponse.json(rows.map((r) => r.opportunity).filter(Boolean));
}

// PATCH /api/opportunities  body: { oldName, newName }
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json();
  const { oldName, newName: rawNew } = body;

  if (!oldName?.trim() || !rawNew?.trim()) {
    return NextResponse.json(
      { error: "oldName and newName are required." },
      { status: 400 }
    );
  }

  const newName = rawNew.trim();

  // Reject if newName already exists as a distinct opportunity
  const existing = await prisma.application.findFirst({
    where: { opportunity: newName },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      {
        error:
          "An opportunity with that name already exists. If you want to merge, contact the system administrator.",
      },
      { status: 409 }
    );
  }

  const result = await prisma.application.updateMany({
    where: { opportunity: oldName.trim() },
    data: { opportunity: newName },
  });

  return NextResponse.json({ success: true, updated: result.count });
}
