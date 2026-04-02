import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "@/lib/prisma";
import { GET, PATCH } from "@/app/api/applications/route";

// Unique email so this test file never collides with real data or other test files
const TEST_EMAIL = "test-notes-1@test.com";

let applicantId: string;
let applicationId: string;

// Builds a PATCH Request the same way the admin UI does — JSON body, explicit Content-Type
function makePatchRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/applications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Builds a GET Request with query params (e.g. applicantId=...)
function makeGetRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/applications");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

// Runs before every test — seeds one Applicant and one Application with all note fields null
beforeEach(async () => {
  const applicant = await prisma.applicant.create({
    data: { email: TEST_EMAIL, name: "Notes Test User" },
  });
  applicantId = applicant.id;

  const application = await prisma.application.create({
    data: {
      applicant_id: applicantId,
      role: "Marketing Intern",
      opportunity: "Notes Test Program",
      track: "Project",
      status: "To Review",
      season: "Spring 2025",
    },
  });
  applicationId = application.id;
});

// Runs after every test — deletes only the rows we created above
afterEach(async () => {
  await prisma.application.deleteMany({ where: { applicant_id: applicantId } });
  await prisma.applicant.delete({ where: { id: applicantId } });
});

describe("PATCH /api/applications — notes fields", () => {
  it("updates application_notes and persists the value to the database", async () => {
    const res = await PATCH(makePatchRequest({ id: applicationId, application_notes: "Initial app note" }));
    expect(res.status).toBe(200);

    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.application_notes).toBe("Initial app note");
  });

  it("updates interview_notes and persists the value to the database", async () => {
    const res = await PATCH(makePatchRequest({ id: applicationId, interview_notes: "Interview went well" }));
    expect(res.status).toBe(200);

    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.interview_notes).toBe("Interview went well");
  });

  it("updates decision_notes and persists the value to the database", async () => {
    const res = await PATCH(makePatchRequest({ id: applicationId, decision_notes: "Strong fit for the role" }));
    expect(res.status).toBe(200);

    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.decision_notes).toBe("Strong fit for the role");
  });

  it("patching one note field does NOT overwrite the other two", async () => {
    // Seed all three fields with distinct known values so we can detect any unexpected overwrite
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        application_notes: "original app note",
        interview_notes: "original interview note",
        decision_notes: "original decision note",
      },
    });

    // Send a PATCH that only includes application_notes
    await PATCH(makePatchRequest({ id: applicationId, application_notes: "updated app note" }));

    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.application_notes).toBe("updated app note");
    // The other two fields must be completely untouched
    expect(app!.interview_notes).toBe("original interview note");
    expect(app!.decision_notes).toBe("original decision note");
  });
});

describe("GET /api/applications — all three note fields are returned", () => {
  it("includes application_notes, interview_notes, and decision_notes in the response payload", async () => {
    // Seed known values for all three fields so we can assert exact values in the response
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        application_notes: "app note value",
        interview_notes: "interview note value",
        decision_notes: "decision note value",
      },
    });

    const res = await GET(makeGetRequest({ applicantId }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].application_notes).toBe("app note value");
    expect(data[0].interview_notes).toBe("interview note value");
    expect(data[0].decision_notes).toBe("decision note value");
  });
});
