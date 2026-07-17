import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mock auth() so we can control the session in route tests ─────────────────
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/applications/bulk-status/route";
import prisma from "@/lib/prisma";

// ── Session fixtures ──────────────────────────────────────────────────────────
const AUTHED_SESSION = {
  user: { id: "u-test", email: "test@sjsu.edu", name: "Test" },
  expires: "2099-01-01",
};

function makeRequest(body: object): Request {
  return new Request("http://localhost/api/applications/bulk-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Test DB setup ─────────────────────────────────────────────────────────────
const TEST_EMAIL_PREFIX = "test-bulk-status-";
let applicantId: string;
let appIds: string[] = [];

beforeEach(async () => {
  vi.mocked(auth).mockResolvedValue(AUTHED_SESSION as any);

  const applicant = await prisma.applicant.create({
    data: {
      email: `${TEST_EMAIL_PREFIX}${Date.now()}@test.com`,
      name: "Bulk Status Test User",
    },
  });
  applicantId = applicant.id;
  appIds = [];

  // Create 3 applications
  for (let i = 0; i < 3; i++) {
    const app = await prisma.application.create({
      data: {
        applicant_id: applicantId,
        role: `Role ${i}`,
        opportunity: "Bulk Test Opportunity",
        track: "Project",
        status: "To Review",
        season: "Fall 2025",
      },
    });
    appIds.push(app.id);
  }
});

afterEach(async () => {
  await prisma.application.deleteMany({ where: { applicant_id: applicantId } });
  await prisma.applicant.delete({ where: { id: applicantId } });
});

// ── Unauthenticated ───────────────────────────────────────────────────────────
describe("POST /api/applications/bulk-status — unauthenticated", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest({ ids: [appIds[0]], status: "Interviewing" }));
    expect(res.status).toBe(401);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────
describe("POST /api/applications/bulk-status — validation", () => {
  it("returns 400 for empty ids array", async () => {
    const res = await POST(makeRequest({ ids: [], status: "Interviewing" }));
    expect(res.status).toBe(400);
    // DB unchanged
    const apps = await prisma.application.findMany({ where: { applicant_id: applicantId } });
    expect(apps.every((a) => a.status === "To Review")).toBe(true);
  });

  it("returns 400 when ids exceeds 200", async () => {
    const bigIds = Array.from({ length: 201 }, (_, i) => `fake-id-${i}`);
    const res = await POST(makeRequest({ ids: bigIds, status: "Interviewing" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for status 'Accepted'", async () => {
    const res = await POST(makeRequest({ ids: [appIds[0]], status: "Accepted" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported status/i);
    // DB unchanged
    const apps = await prisma.application.findMany({ where: { applicant_id: applicantId } });
    expect(apps.every((a) => a.status === "To Review")).toBe(true);
  });

  it("returns 400 for arbitrary junk status", async () => {
    const res = await POST(makeRequest({ ids: [appIds[0]], status: "Nope" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported status/i);
    // DB unchanged
    const apps = await prisma.application.findMany({ where: { applicant_id: applicantId } });
    expect(apps.every((a) => a.status === "To Review")).toBe(true);
  });

  it("returns 400 for empty string status", async () => {
    const res = await POST(makeRequest({ ids: [appIds[0]], status: "" }));
    expect(res.status).toBe(400);
  });
});

// ── Successful updates ────────────────────────────────────────────────────────
describe("POST /api/applications/bulk-status — success", () => {
  it("moves N applications to Interviewing; DB reflects the change", async () => {
    const res = await POST(makeRequest({ ids: appIds, status: "Interviewing" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(3);
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);

    const apps = await prisma.application.findMany({ where: { applicant_id: applicantId } });
    expect(apps.every((a) => a.status === "Interviewing")).toBe(true);
  });

  it("moves a mixed set to Rejected; DB reflects the change", async () => {
    // Set one to Interviewing first
    await prisma.application.update({
      where: { id: appIds[0] },
      data: { status: "Interviewing" },
    });

    const res = await POST(makeRequest({ ids: [appIds[0], appIds[1]], status: "Rejected" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);

    const app0 = await prisma.application.findUnique({ where: { id: appIds[0] } });
    const app1 = await prisma.application.findUnique({ where: { id: appIds[1] } });
    expect(app0!.status).toBe("Rejected");
    expect(app1!.status).toBe("Rejected");
  });

  it("de-duplicates ids; each row updated once", async () => {
    const res = await POST(
      makeRequest({ ids: [appIds[0], appIds[0], appIds[1]], status: "Interviewing" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // De-duplicated to 2 unique ids
    expect(body.results).toHaveLength(2);
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
  });

  it("returns { ok: false, error: 'not-found' } for unknown id; other rows still succeed", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const res = await POST(
      makeRequest({ ids: [appIds[0], unknownId, appIds[1]], status: "Interviewing" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(3);

    const successRows = body.results.filter((r: { ok: boolean }) => r.ok);
    const failRows = body.results.filter((r: { ok: boolean; id: string }) => !r.ok);
    expect(successRows).toHaveLength(2);
    expect(failRows).toHaveLength(1);
    expect(failRows[0].id).toBe(unknownId);
    expect(failRows[0].error).toBe("not-found");

    // Succeeded rows are updated in DB
    const app0 = await prisma.application.findUnique({ where: { id: appIds[0] } });
    const app1 = await prisma.application.findUnique({ where: { id: appIds[1] } });
    expect(app0!.status).toBe("Interviewing");
    expect(app1!.status).toBe("Interviewing");
  });
});
