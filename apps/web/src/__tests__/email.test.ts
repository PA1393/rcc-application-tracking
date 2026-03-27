import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import prisma from "@/lib/prisma";

// Replace the real sendEmail function with a fake one so tests never open a real
// SMTP connection to Gmail. vi.mock() is hoisted to the top of the file at
// compile time, so it intercepts the module before any import below can use it.
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "mock-id-123" }),
}));

// These imports come after vi.mock() so they receive the fake versions.
import { sendEmail } from "@/lib/email";
import { POST } from "@/app/api/email/route";

const TEST_EMAIL = "test-email-1@test.com";

// IDs are assigned in beforeEach and shared across each test and the cleanup hook.
let applicantId: string;
let applicationId: string;

// Builds a proper HTTP Request object to pass directly into the route handler.
// Calling POST(req) skips the actual HTTP server — we're testing the function logic.
function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3001/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Runs before every test:
// 1. Resets the mock so call counts from the previous test don't carry over.
// 2. Seeds a fresh Applicant + Application in the real database.
beforeEach(async () => {
  vi.mocked(sendEmail).mockClear();
  vi.mocked(sendEmail).mockResolvedValue({ messageId: "mock-id-123" } as any); // reset to default resolved value in case any test modified it

  const applicant = await prisma.applicant.create({
    data: { email: TEST_EMAIL, name: "Email Test User" },
  });
  applicantId = applicant.id;

  // Status "Interviewing" maps to the "interview_invite_sent" timestamp field
  // in the route — so these tests exercise the interview invite flow.
  const application = await prisma.application.create({
    data: {
      applicant_id: applicantId,
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      status: "Interviewing",
      season: "Spring 2025",
    },
  });
  applicationId = application.id;
});

// Runs after every test — deletes only the rows created above.
// Real applicant data in the database is never touched.
afterEach(async () => {
  await prisma.application.deleteMany({ where: { applicant_id: applicantId } });
  await prisma.applicant.delete({ where: { id: applicantId } });
});

describe("POST /api/email", () => {
  it("returns 404 when applicationId does not exist", async () => {
    // Send a UUID that has no matching row — route should bail out with 404.
    const res = await POST(makeRequest({
      applicationId: "00000000-0000-0000-0000-000000000000",
      subject: "Test",
      body: "Test body",
    }));

    expect(res.status).toBe(404);
  });

  it("returns 200, fires sendEmail, and writes interview_invite_sent timestamp", async () => {
    const res = await POST(makeRequest({
      applicationId,
      subject: "Interview Invitation",
      body: "You are invited to interview.",
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.messageId).toBe("mock-id-123");

    // Confirm the timestamp was actually written to the DB after a successful send.
    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.interview_invite_sent).not.toBeNull();
  });

  it("returns 409 and does not call sendEmail when email was already sent", async () => {
    // Pre-stamp the timestamp to simulate a previous send having already happened.
    await prisma.application.update({
      where: { id: applicationId },
      data: { interview_invite_sent: new Date() },
    });

    const res = await POST(makeRequest({
      applicationId,
      subject: "Interview Invitation",
      body: "Duplicate send attempt.",
    }));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already sent/i);
    // The mock should have zero calls — the route must exit before reaching sendEmail.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 500 and does NOT write timestamp when sendEmail throws", async () => {
    // Override the mock for this one test to simulate an SMTP failure.
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP failure"));

    const res = await POST(makeRequest({
      applicationId,
      subject: "Interview Invitation",
      body: "This will fail.",
    }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);

    // The route only writes the timestamp after a confirmed send — verify it stayed null.
    const app = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(app!.interview_invite_sent).toBeNull();
  });

  it("uses preferred_email when set on the applicant", async () => {
    await prisma.applicant.update({
      where: { id: applicantId },
      data: { preferred_email: "preferred@test.com" },
    });

    await POST(makeRequest({
      applicationId,
      subject: "Interview Invitation",
      body: "Sent to preferred address.",
    }));

    // Inspect what arguments the mock was actually called with.
    // .mock.calls[0][0] = the first argument passed in the first call to sendEmail.
    const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
    expect(callArgs.to).toBe("preferred@test.com");
  });
});
