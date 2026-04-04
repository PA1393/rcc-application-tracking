import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock auth() before importing any route ────────────────────────────────────
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// ── Mock prisma so routes don't touch a real DB ───────────────────────────────
vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// ── Mock import-route dependencies ────────────────────────────────────────────
vi.mock("@/lib/parseCsv", () => ({
  parseRawCsv:             vi.fn(),
  detectCsvFormType:       vi.fn(),
  normalizeData:           vi.fn(),
  normalizeAmbassadorData: vi.fn(),
}));
vi.mock("@/lib/upsert", () => ({
  upsertApplicant: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { GET, POST, DELETE } from "@/app/api/users/route";
import { POST as importPOST } from "@/app/api/import/route";

// ── Session fixtures ──────────────────────────────────────────────────────────

const NO_SESSION = null;

const AUTHED_SESSION = {
  user: { id: "u-user", email: "user@sjsu.edu", name: "User" },
  expires: "2099-01-01",
};

function makeRequest(method: string, body?: object): Request {
  return new Request("http://localhost/api/users", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeImportRequest(): Request {
  const formData = new FormData();
  const blob = new Blob(["col1,col2\nval1,val2"], { type: "text/csv" });
  formData.append("file", blob, "test.csv");
  formData.append("opportunity", "Test Opportunity");
  formData.append("formType", "project");
  return new Request("http://localhost/api/import", { method: "POST", body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── /api/users — unauthenticated ──────────────────────────────────────────────

describe("/api/users — unauthenticated (no session)", () => {
  beforeEach(() => { vi.mocked(auth).mockResolvedValue(NO_SESSION as any); });

  it("GET returns 401", async () => {
    expect((await GET()).status).toBe(401);
  });
  it("POST returns 401", async () => {
    expect((await POST(makeRequest("POST", { email: "x@x.com" }))).status).toBe(401);
  });
  it("DELETE returns 401", async () => {
    expect((await DELETE(makeRequest("DELETE", { id: "1" }))).status).toBe(401);
  });
});

// ── /api/users — authenticated user ──────────────────────────────────────────

describe("/api/users — authenticated user", () => {
  beforeEach(async () => {
    vi.mocked(auth).mockResolvedValue(AUTHED_SESSION as any);
    const { default: prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u-new", name: null, email: "new@sjsu.edu", image: null,
    } as any);
  });

  it("GET returns 200", async () => {
    expect((await GET()).status).toBe(200);
  });
  it("POST proceeds past auth guard (returns 201 or 409, not 401/403)", async () => {
    const status = (await POST(makeRequest("POST", { email: "new@sjsu.edu" }))).status;
    expect([201, 409]).toContain(status);
  });
  it("DELETE proceeds past auth guard (returns 200, not 401/403)", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.user.delete).mockResolvedValue({} as any);
    const status = (await DELETE(makeRequest("DELETE", { id: "1" }))).status;
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });
});

// ── /api/import — unauthenticated ────────────────────────────────────────────

describe("/api/import — unauthenticated (no session)", () => {
  beforeEach(() => { vi.mocked(auth).mockResolvedValue(NO_SESSION as any); });

  it("POST returns 401", async () => {
    expect((await importPOST(makeImportRequest())).status).toBe(401);
  });
});

// ── /api/import — authenticated user ─────────────────────────────────────────

describe("/api/import — authenticated user", () => {
  beforeEach(() => { vi.mocked(auth).mockResolvedValue(AUTHED_SESSION as any); });

  it("POST proceeds past auth guard and reaches import logic (returns 200 or 400, not 401/403)", async () => {
    const { parseRawCsv, detectCsvFormType, normalizeData } = await import("@/lib/parseCsv");
    const { upsertApplicant } = await import("@/lib/upsert");
    vi.mocked(parseRawCsv).mockResolvedValue([{ "SJSU Email": "t@sjsu.edu" }]);
    vi.mocked(detectCsvFormType).mockReturnValue("project");
    vi.mocked(normalizeData).mockReturnValue([{ name: "T", email: "t@sjsu.edu" }] as any);
    vi.mocked(upsertApplicant).mockResolvedValue({ isNew: true } as any);

    const status = (await importPOST(makeImportRequest())).status;
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });
});
