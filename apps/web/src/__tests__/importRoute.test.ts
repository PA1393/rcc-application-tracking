import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.mock() is hoisted to the top of the file at compile time — these intercept
// the modules before the route handler imports them, so the route sees the mocks.

// Mock auth so the route doesn't try to resolve next-auth internals in Vitest.
// All existing import tests assume an admin caller; auth-guards.test.ts covers denial paths.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "u-admin", email: "admin@sjsu.edu", role: "admin" },
    expires: "2099-01-01",
  }),
}));

// Mock parseCsv so we control what the route "reads" from the CSV without touching
// the filesystem or real PapaParse logic.
vi.mock("@/lib/parseCsv", () => ({
  parseRawCsv:                    vi.fn(),
  detectCsvFormType:              vi.fn(),
  normalizeData:                  vi.fn(),
  normalizeAmbassadorMatrixData:  vi.fn(),
  normalizeEboardData:            vi.fn(),
}));

// Mock upsertApplicant so the import route doesn't write to the real database.
vi.mock("@/lib/upsert", () => ({
  upsertApplicant: vi.fn(),
}));

// Mock prisma so the opportunity-family compatibility check doesn't hit a real DB.
// Default: findFirst returns null (new opportunity — no compatibility concern).
vi.mock("@/lib/prisma", () => ({
  default: {
    application: {
      findFirst: vi.fn(),
    },
  },
}));

import { parseRawCsv, detectCsvFormType, normalizeData, normalizeAmbassadorMatrixData, normalizeEboardData } from "@/lib/parseCsv";
import { upsertApplicant } from "@/lib/upsert";
import prisma from "@/lib/prisma";
import { POST } from "@/app/api/import/route";

// A minimal valid CSV string — content doesn't matter because parseRawCsv is mocked,
// but the route requires a File object to pass the "no file" guard.
const DUMMY_CSV = "col1,col2\nval1,val2";

// A single non-invalid row returned by the normalizer mocks.
// The route only calls upsertApplicant on rows that don't have _invalid set.
const VALID_ROW = { name: "Test User", email: "test@sjsu.edu" };

// Builds a Request with FormData that matches exactly what the browser sends on import.
function makeImportRequest(formType: string, csvContent = DUMMY_CSV): Request {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, "test.csv");
  formData.append("opportunity", "Test Opportunity");
  formData.append("formType", formType);
  return new Request("http://localhost/api/import", { method: "POST", body: formData });
}

// Raw row objects returned by the mocked parseRawCsv — one row per test (overridden per test)
const RAW_ROW = { "SJSU Email": "test@sjsu.edu", "Name (First Last)": "Test User" };

beforeEach(() => {
  // Clear all mock call history and return values before each test so nothing bleeds across tests
  vi.clearAllMocks();

  vi.mocked(parseRawCsv).mockResolvedValue([RAW_ROW]);
  vi.mocked(normalizeData).mockReturnValue([VALID_ROW]);
  vi.mocked(normalizeAmbassadorMatrixData).mockReturnValue([VALID_ROW]);
  vi.mocked(normalizeEboardData).mockReturnValue([VALID_ROW]);
  vi.mocked(upsertApplicant).mockResolvedValue({ isNew: true } as any);
  // Default: no existing applications for this opportunity (new opportunity — allow all imports)
  vi.mocked(prisma.application.findFirst).mockResolvedValue(null);
});

describe("POST /api/import — form type branching", () => {
  it("calls normalizeAmbassadorMatrixData (not normalizeData) when formType is 'ambassador'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");

    const res = await POST(makeImportRequest("ambassador"));
    expect(res.status).toBe(200);

    expect(normalizeAmbassadorMatrixData).toHaveBeenCalledOnce();
    expect(normalizeData).not.toHaveBeenCalled();
  });

  it("calls normalizeData (not normalizeAmbassadorMatrixData) when formType is 'project'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    const res = await POST(makeImportRequest("project"));
    expect(res.status).toBe(200);

    expect(normalizeData).toHaveBeenCalledOnce();
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  it("returns 400 when detected type is 'ambassador_matrix' but formType is 'project'", async () => {
    // The CSV looks like an Ambassador form but the user selected Project/Intern in the UI
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/ambassador form/i);
    // Neither normalizer should have been called — the route exits early
    expect(normalizeData).not.toHaveBeenCalled();
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  it("returns 400 when detected type is 'project' but formType is 'ambassador'", async () => {
    // The CSV looks like a Project form but the user selected Ambassador in the UI
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    const res = await POST(makeImportRequest("ambassador"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/project.*intern form/i);
    expect(normalizeData).not.toHaveBeenCalled();
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  it("returns 400 when the form type cannot be detected", async () => {
    // Headers don't match any known signal — detection returns 'unknown'
    vi.mocked(detectCsvFormType).mockReturnValue("unknown");

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/could not detect/i);
  });

  it("returns inserted and updated counts in the response summary", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    // Two rows: one newly inserted, one re-imported (updated)
    const twoRows = [
      { name: "User One", email: "one@sjsu.edu" },
      { name: "User Two", email: "two@sjsu.edu" },
    ];
    vi.mocked(normalizeData).mockReturnValue(twoRows);
    vi.mocked(parseRawCsv).mockResolvedValue([{}, {}]);

    // First upsert returns isNew: true, second returns isNew: false
    vi.mocked(upsertApplicant)
      .mockResolvedValueOnce({ isNew: true } as any)
      .mockResolvedValueOnce({ isNew: false } as any);

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.inserted).toBe(1);
    expect(data.updated).toBe(1);
    expect(data.skipped).toBe(0);
    expect(data.errors).toHaveLength(0);
  });

  // ── Ambassador matrix branching ───────────────────────────────────────────

  it("calls normalizeAmbassadorMatrixData when formType is 'ambassador' and detected type is 'ambassador_matrix'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");

    const res = await POST(makeImportRequest("ambassador"));
    expect(res.status).toBe(200);

    expect(normalizeAmbassadorMatrixData).toHaveBeenCalledOnce();
    expect(normalizeData).not.toHaveBeenCalled();
  });

  it("returns 400 when detected type is 'ambassador_matrix' but formType is 'eboard'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");

    const res = await POST(makeImportRequest("eboard"));

    expect(res.status).toBe(400);
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  // ── E-Board branching ──────────────────────────────────────────────────────

  it("calls normalizeEboardData (not others) when formType is 'eboard'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("eboard");

    const res = await POST(makeImportRequest("eboard"));
    expect(res.status).toBe(200);

    expect(normalizeEboardData).toHaveBeenCalledOnce();
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
    expect(normalizeData).not.toHaveBeenCalled();
  });

  it("returns 400 when detected type is 'eboard' but formType is 'ambassador'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("eboard");

    const res = await POST(makeImportRequest("ambassador"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/e-board form/i);
    expect(normalizeEboardData).not.toHaveBeenCalled();
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  it("returns 400 when detected type is 'eboard' but formType is 'project'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("eboard");

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/e-board form/i);
    expect(normalizeEboardData).not.toHaveBeenCalled();
    expect(normalizeData).not.toHaveBeenCalled();
  });

  it("returns 400 when formType is 'eboard' but detected type is 'ambassador_matrix'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");

    const res = await POST(makeImportRequest("eboard"));

    expect(res.status).toBe(400);
    expect(normalizeEboardData).not.toHaveBeenCalled();
  });

  it("returns 400 when formType is 'eboard' but detected type is 'project'", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    const res = await POST(makeImportRequest("eboard"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/does not look like an e-board form/i);
    expect(normalizeEboardData).not.toHaveBeenCalled();
  });

  it("skips invalid rows flagged by the normalizer and reports them in errors", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    // One valid row, one invalid row (missing email/name)
    const mixedRows = [
      { name: "Valid User", email: "valid@sjsu.edu" },
      { _invalid: true, _reason: "Missing email or name", rawData: {} },
    ];
    vi.mocked(normalizeData).mockReturnValue(mixedRows);

    vi.mocked(upsertApplicant).mockResolvedValueOnce({ isNew: true } as any);

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.inserted).toBe(1);
    expect(data.skipped).toBe(1);
    expect(data.errors).toHaveLength(1);
    // upsertApplicant should only have been called for the one valid row
    expect(upsertApplicant).toHaveBeenCalledOnce();
  });

  // ── Opportunity-family compatibility checks ────────────────────────────────

  it("allows import when the opportunity is new (no existing applications)", async () => {
    // Default beforeEach: findFirst returns null — new opportunity
    vi.mocked(detectCsvFormType).mockReturnValue("project");

    const res = await POST(makeImportRequest("project"));
    expect(res.status).toBe(200);
    expect(normalizeData).toHaveBeenCalledOnce();
  });

  it("allows import when the incoming family matches the existing opportunity family", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");
    // Existing opportunity already has Ambassador-family apps
    vi.mocked(prisma.application.findFirst).mockResolvedValue({ track: "Ambassador" } as any);

    const res = await POST(makeImportRequest("ambassador"));
    expect(res.status).toBe(200);
    expect(normalizeAmbassadorMatrixData).toHaveBeenCalledOnce();
  });

  it("returns 400 when importing a Project/Intern CSV into an Ambassador-type opportunity", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("project");
    vi.mocked(prisma.application.findFirst).mockResolvedValue({ track: "Ambassador" } as any);

    const res = await POST(makeImportRequest("project"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/project\/intern form.*ambassador-type opportunity/i);
    expect(normalizeData).not.toHaveBeenCalled();
  });

  it("returns 400 when importing an Ambassador CSV into a Project/Intern opportunity", async () => {
    vi.mocked(detectCsvFormType).mockReturnValue("ambassador_matrix");
    vi.mocked(prisma.application.findFirst).mockResolvedValue({ track: "General" } as any);

    const res = await POST(makeImportRequest("ambassador"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/ambassador-type form.*project\/intern opportunity/i);
    expect(normalizeAmbassadorMatrixData).not.toHaveBeenCalled();
  });

  it("returns 400 when importing an E-Board CSV into a Project/Intern opportunity", async () => {
    // E-Board is ambassador-family — same rejection logic
    vi.mocked(detectCsvFormType).mockReturnValue("eboard");
    vi.mocked(prisma.application.findFirst).mockResolvedValue({ track: "General" } as any);

    const res = await POST(makeImportRequest("eboard"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/ambassador-type form.*project\/intern opportunity/i);
    expect(normalizeEboardData).not.toHaveBeenCalled();
  });

  it("allows an E-Board import into an existing Ambassador-family opportunity", async () => {
    // E-Board and Ambassador are in the same family bucket
    vi.mocked(detectCsvFormType).mockReturnValue("eboard");
    vi.mocked(prisma.application.findFirst).mockResolvedValue({ track: "Ambassador" } as any);

    const res = await POST(makeImportRequest("eboard"));
    expect(res.status).toBe(200);
    expect(normalizeEboardData).toHaveBeenCalledOnce();
  });
});
