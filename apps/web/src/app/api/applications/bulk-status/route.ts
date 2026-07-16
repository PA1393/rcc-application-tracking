import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ALLOWED_STATUSES = ["Interviewing", "Rejected"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

// POST /api/applications/bulk-status
// Body: { ids: string[], status: string }
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const body = await request.json();
  const { ids, status } = body;

  // Validate status first
  if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json(
      { error: `Unsupported status. Must be one of: ${ALLOWED_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Validate ids: must be a non-empty array, cap at 200
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array." }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json(
      { error: "ids exceeds maximum batch size of 200." },
      { status: 400 }
    );
  }

  // De-duplicate and filter to string entries only
  const uniqueIds: string[] = [...new Set(ids.filter((id): id is string => typeof id === "string"))];

  // Process each row independently
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const id of uniqueIds) {
    try {
      await prisma.application.update({
        where: { id },
        data: { status },
      });
      results.push({ id, ok: true });
    } catch (err: unknown) {
      // Prisma "record not found" throws P2025
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2025"
      ) {
        results.push({ id, ok: false, error: "not-found" });
      } else {
        results.push({ id, ok: false, error: "server-error" });
      }
    }
  }

  return NextResponse.json({ results });
}
