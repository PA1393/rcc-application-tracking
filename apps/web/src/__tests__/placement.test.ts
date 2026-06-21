import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { acceptApplicant } from "@/lib/placement";
import prisma from "@/lib/prisma";

const TEST_EMAIL = "test-placement-1@test.com";

let applicantId: string;
let appAId: string; // Project track — the one we accept
let appBId: string; // Project track — should be Closed after accept
let appCId: string; // Ambassador track — should remain untouched

beforeEach(async () => {
  // Create the test Applicant
  const applicant = await prisma.applicant.create({
    data: { email: TEST_EMAIL, name: "Placement Test User" },
  });
  applicantId = applicant.id;

  // Application A: the one that will be accepted
  const appA = await prisma.application.create({
    data: {
      applicant_id: applicantId,
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      status: "Interviewing",
      season: "Spring 2025",
    },
  });
  appAId = appA.id;

  // Application B: same track — should be closed when A is accepted
  const appB = await prisma.application.create({
    data: {
      applicant_id: applicantId,
      role: "Web Dev Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      status: "To Review",
      season: "Spring 2025",
    },
  });
  appBId = appB.id;

  // Application C: different track — must NOT be touched
  const appC = await prisma.application.create({
    data: {
      applicant_id: applicantId,
      role: "Ambassador",
      opportunity: "Ambassador Program",
      track: "Ambassador",
      status: "Interviewing",
      season: "Spring 2025",
    },
  });
  appCId = appC.id;
});

afterEach(async () => {
  await prisma.placement.deleteMany({ where: { applicant_id: applicantId } });
  await prisma.application.deleteMany({ where: { applicant_id: applicantId } });
  await prisma.applicant.delete({ where: { id: applicantId } });
});

describe("acceptApplicant", () => {
  it("sets the accepted application status to Accepted", async () => {
    await acceptApplicant(appAId);

    const appA = await prisma.application.findUnique({ where: { id: appAId } });
    expect(appA!.status).toBe("Accepted");
  });

  it("creates a Placement record for the accepted track and season", async () => {
    await acceptApplicant(appAId);

    const placement = await prisma.placement.findFirst({
      where: { applicant_id: applicantId, track: "Project", season: "Spring 2025" },
    });
    expect(placement).not.toBeNull();
    expect(placement!.role).toBe("Marketing Intern");
  });

  it("closes other open applications in the same track", async () => {
    await acceptApplicant(appAId);

    const appB = await prisma.application.findUnique({ where: { id: appBId } });
    expect(appB!.status).toBe("Closed");
  });

  it("does NOT close applications in a different track", async () => {
    await acceptApplicant(appAId);

    const appC = await prisma.application.findUnique({ where: { id: appCId } });
    expect(appC!.status).toBe("Interviewing");
  });

  it("does not change already-Rejected applications in the same track", async () => {
    // Move Application B to Rejected before accepting A
    await prisma.application.update({
      where: { id: appBId },
      data: { status: "Rejected" },
    });

    await acceptApplicant(appAId);

    const appB = await prisma.application.findUnique({ where: { id: appBId } });
    // The notIn guard in placement.ts excludes Rejected — must stay Rejected
    expect(appB!.status).toBe("Rejected");
  });
});
