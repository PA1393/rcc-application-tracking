import { describe, it, expect, afterEach } from "vitest";
import { upsertApplicant } from "@/lib/upsert";
import prisma from "@/lib/prisma";

// Unique emails so these tests never collide with real data
const EMAIL_1 = "test-upsert-1@test.com";
const EMAIL_2 = "test-upsert-2@test.com";

afterEach(async () => {
  // Clean up in dependency order: Applications first, then Applicants
  await prisma.application.deleteMany({
    where: { applicant: { email: { in: [EMAIL_1, EMAIL_2] } } },
  });
  await prisma.applicant.deleteMany({
    where: { email: { in: [EMAIL_1, EMAIL_2] } },
  });
});

describe("upsertApplicant", () => {
  it("creates a new Applicant and Application for a fresh import", async () => {
    await upsertApplicant({
      email: EMAIL_1,
      name: "Test User One",
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      season: "Spring 2025",
      rawData: { raw: "data" },
    });

    const applicant = await prisma.applicant.findUnique({ where: { email: EMAIL_1 } });
    expect(applicant).not.toBeNull();
    expect(applicant!.name).toBe("Test User One");

    const applications = await prisma.application.findMany({
      where: { applicant_id: applicant!.id },
    });
    expect(applications).toHaveLength(1);
    expect(applications[0].status).toBe("To Review");
    expect(applications[0].role).toBe("Marketing Intern");
  });

  it("re-importing the same (email, role, season) does NOT reset status", async () => {
    // First import
    const { application } = await upsertApplicant({
      email: EMAIL_1,
      name: "Test User One",
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      season: "Spring 2025",
      rawData: { original: true },
    });

    // Reviewer moves the application forward
    await prisma.application.update({
      where: { id: application.id },
      data: { status: "Interviewing" },
    });

    // CSV re-imported with updated raw data
    await upsertApplicant({
      email: EMAIL_1,
      name: "Test User One",
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      season: "Spring 2025",
      rawData: { updated: true },
    });

    const updated = await prisma.application.findUnique({ where: { id: application.id } });
    // Status must be preserved — this is the dedup contract
    expect(updated!.status).toBe("Interviewing");
    // rawData should have been refreshed
    expect(updated!.rawData).toEqual({ updated: true });
  });

  it("re-importing the same email with a different role creates a second Application", async () => {
    await upsertApplicant({
      email: EMAIL_2,
      name: "Test User Two",
      role: "Marketing Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      season: "Spring 2025",
      rawData: {},
    });

    await upsertApplicant({
      email: EMAIL_2,
      name: "Test User Two",
      role: "Web Dev Intern",
      opportunity: "Creative Destination Program",
      track: "Project",
      season: "Spring 2025",
      rawData: {},
    });

    const applicant = await prisma.applicant.findUnique({ where: { email: EMAIL_2 } });
    expect(applicant).not.toBeNull();

    const applications = await prisma.application.findMany({
      where: { applicant_id: applicant!.id },
    });
    // One Applicant, two Applications for the two different roles
    expect(applications).toHaveLength(2);
    const roles = applications.map((a) => a.role).sort();
    expect(roles).toEqual(["Marketing Intern", "Web Dev Intern"]);
  });
});
