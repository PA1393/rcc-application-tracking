import prisma from "@/lib/prisma"; 

const db = prisma;

//handles Applicant database and Application database
export async function upsertApplicant(person: any) {


    //1. upsert applicant
    const applicant = await db.applicant.upsert({
        where: { email: person.email },

        //if they dont exist, create new record
        create: {
          email: person.email,
          name: person.name,
        },

        //do exist --> update their record with new name (if it changed)
        update: {
          name: person.name,
        },
    });


  // Split comma-separated roles into individual applications
  const roles: string[] = (person.role ?? "Unknown")
    .split(",")
    .map((r: string) => r.trim())
    .filter(Boolean);

  const applications = await Promise.all(
    roles.map((role) =>
      db.application.upsert({
        where: {
          applicant_id_role_season: {
            applicant_id: applicant.id,
            role,
            season: person.season ?? "Spring 2025",
          },
        },
        create: {
          applicant_id: applicant.id,
          role,
          track: person.track ?? "General",
          status: "To Review",
          season: person.season ?? "Spring 2025",
          rawData: person.rawData,
        },
        update: {
          rawData: person.rawData,
        },
      })
    )
  );

  return { applicant, applications };


}