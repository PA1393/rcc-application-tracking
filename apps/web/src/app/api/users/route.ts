import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

type SessionLike = { user?: { role?: string } } | null;

function adminGuard(session: SessionLike): NextResponse | null {
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  if (session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return null;
}

// GET /api/users — list all users (no password hashes)
export async function GET() {
  const deny = adminGuard(await auth());
  if (deny) return deny;

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, image: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json(users);
}

// POST /api/users — add an approved user (invite-only, no password set)
export async function POST(request: Request) {
  const deny = adminGuard(await auth());
  if (deny) return deny;

  const body = await request.json();

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const name: string | undefined =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;

  const role: string =
    body.role === "admin" || body.role === "reviewer" ? body.role : "reviewer";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, name, role, password: null },
    select: { id: true, name: true, email: true, role: true, image: true },
  });

  return NextResponse.json(user, { status: 201 });
}

// PATCH /api/users — update a user's role
export async function PATCH(request: Request) {
  const deny = adminGuard(await auth());
  if (deny) return deny;

  const body = await request.json();

  const { id, role } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }
  if (role !== "admin" && role !== "reviewer") {
    return NextResponse.json({ error: "role must be 'admin' or 'reviewer'." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true, image: true },
  });

  return NextResponse.json(user);
}

// DELETE /api/users — remove a user
// Account and Session have onDelete: Cascade in schema, so deleting the User row
// automatically removes linked OAuth accounts and sessions.
export async function DELETE(request: Request) {
  const deny = adminGuard(await auth());
  if (deny) return deny;

  const body = await request.json();

  const { id } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
