import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

// PATCH /api/opportunities  body: { oldName, newName }
export async function PATCH(request: Request) {
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
