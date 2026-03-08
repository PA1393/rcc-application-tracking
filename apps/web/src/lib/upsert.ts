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
      track: person.track ?? "General",
      status: "Applied", //default status for new imports
      season: person.season ?? "Spring 2025",
      rawData: person.rawData,
    },

    //if already exists just refresh the data
    update: {
      rawData: person.rawData, 
    },
  });

  return { applicant, application };


}