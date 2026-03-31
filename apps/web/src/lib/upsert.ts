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
          ...(person.preferred_email ? { preferred_email: person.preferred_email } : {}),
        },

        //do exist --> update their record with new name (if it changed)
        update: {
          name: person.name,
          ...(person.preferred_email ? { preferred_email: person.preferred_email } : {}),
        },
    });


  // Check if the application already exists so we can report inserted vs updated
  const existingApp = await db.application.findFirst({
    where: {
      applicant_id: applicant.id,
      role: person.role ?? "Unknown",
      season: person.season ?? "Spring 2025",
    },
    select: { id: true },
  });

  const application = await db.application.upsert({
    where: {
      //applicant_id_role_season is a unique constraint that prevents duplicate applications for same person/role/season
        applicant_id_role_season: {
            applicant_id: applicant.id,
            role: person.role ?? "Unknown", //placeholder for missing role
        season: person.season ?? "Spring 2025", //placeholder --> changed this to current season
      },
    },

    //if application for this person/role/season doesnt exist, create new record with default status "Applied"
    create: {
      applicant_id: applicant.id,
      role: person.role ?? "Unknown",
      opportunity: person.opportunity ?? "",
      track: person.track ?? "General",
      status: "To Review", //default status for new imports
      season: person.season ?? "Spring 2025",
      rawData: person.rawData,
    },

    //if already exists just refresh the data
    update: {
      rawData: person.rawData,
      opportunity: person.opportunity ?? "",
    },
  });

  return { applicant, application, isNew: !existingApp };


}