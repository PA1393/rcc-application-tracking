import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth so the route doesn't try to resolve next-auth internals in Vitest.
// Existing tests assume admin access; auth-guards.test.ts covers the denial paths.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "u-admin", email: "admin@sjsu.edu", role: "admin" },
    expires: "2099-01-01",
  }),
}));

// Mock prisma before importing the route so the route sees our mock.
vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { GET, POST, PATCH, DELETE } from "@/app/api/users/route";

const MOCK_USER = {
  id: "user-1",
  name: "Alice Admin",
  email: "alice@sjsu.edu",
  role: "reviewer",
  image: null,
};

function makeRequest(method: string, body?: object): Request {
  return new Request("http://localhost/api/users", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/users", () => {
  it("returns a list of users", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([MOCK_USER] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([MOCK_USER]);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/users", () => {
  it("creates a new user with default reviewer role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(MOCK_USER as any);

    const res = await POST(makeRequest("POST", { email: "alice@sjsu.edu", name: "Alice Admin" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.email).toBe("alice@sjsu.edu");
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "alice@sjsu.edu", role: "reviewer", password: null }),
      })
    );
  });

  it("normalizes email to lowercase", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...MOCK_USER, email: "alice@sjsu.edu" } as any);

    const res = await POST(makeRequest("POST", { email: "  ALICE@SJSU.EDU  " }));
    expect(res.status).toBe(201);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "alice@sjsu.edu" } });
  });

  it("returns 409 when email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER as any);

    const res = await POST(makeRequest("POST", { email: "alice@sjsu.edu" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already exists/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest("POST", { email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("accepts admin role", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...MOCK_USER, role: "admin" } as any);

    const res = await POST(makeRequest("POST", { email: "alice@sjsu.edu", role: "admin" }));
    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "admin" }),
      })
    );
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/users", () => {
  it("updates a user's role", async () => {
    const updated = { ...MOCK_USER, role: "admin" };
    vi.mocked(prisma.user.update).mockResolvedValue(updated as any);

    const res = await PATCH(makeRequest("PATCH", { id: "user-1", role: "admin" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.role).toBe("admin");
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" }, data: { role: "admin" } })
    );
  });

  it("returns 400 for invalid role", async () => {
    const res = await PATCH(makeRequest("PATCH", { id: "user-1", role: "superuser" }));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    const res = await PATCH(makeRequest("PATCH", { role: "admin" }));
    expect(res.status).toBe(400);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/users", () => {
  it("deletes a user by id", async () => {
    vi.mocked(prisma.user.delete).mockResolvedValue(MOCK_USER as any);

    const res = await DELETE(makeRequest("DELETE", { id: "user-1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("returns 400 when id is missing", async () => {
    const res = await DELETE(makeRequest("DELETE", {}));
    expect(res.status).toBe(400);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
