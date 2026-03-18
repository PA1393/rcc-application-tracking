import prisma from "@/lib/prisma";

export async function acceptApplicant(applicationId: string) {
  // 1. Fetch the application being accepted
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  });

  // 2. Mark this application as Accepted + create a Placement record
  const [updated] = await prisma.$transaction([
    prisma.application.update({
      where: { id: applicationId },
      data: { status: "Accepted" },
    }),
    prisma.placement.upsert({
      where: {
        applicant_id_track_season: {
          applicant_id: app.applicant_id,
          track: app.track,
          season: app.season,
        },
      },
      create: {
        applicant_id: app.applicant_id,
        track: app.track,
        role: app.role,
        season: app.season,
      },
      update: {
        role: app.role,
      },
    }),
  ]);

  // 3 & 4. Close all other open applications for this applicant in the same track/season
  await prisma.application.updateMany({
    where: {
      applicant_id: app.applicant_id,
      track: app.track,
      season: app.season,
      id: { not: applicationId },
      status: { notIn: ["Accepted", "Rejected", "Closed"] },
    },
    data: { status: "Closed" },
  });

  return updated;
}
