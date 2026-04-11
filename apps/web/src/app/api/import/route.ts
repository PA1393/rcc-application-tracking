import { normalizeData, normalizeAmbassadorData, normalizeAmbassadorMatrixData, normalizeEboardData, parseRawCsv, detectCsvFormType } from "@/lib/parseCsv";
import { upsertApplicant } from "@/lib/upsert";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
 //because applicant responses can be very long, Papaparse can handle long paragraph responses without columns breaking


export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });


    const formData = await request.formData();

    //recieve uploaded CSV file
    const file = formData.get("file") as File;
    const opportunity = (formData.get("opportunity") as string) ?? "";
    const formType = (formData.get("formType") as string) ?? "project";

    if (!file) { //validate
        return NextResponse.json({ error: "No File Uploaded or File Error"} , { status: 400 });
    }

   const rawParsedData = await parseRawCsv(file);

   // Detect the actual form type from the CSV headers before normalizing
   const detectedType = detectCsvFormType(rawParsedData);

   if (detectedType === "unknown") {
     return NextResponse.json(
       { error: "Could not detect the form type from this CSV. Please make sure the file is a Google Form response export with the expected column headers." },
       { status: 400 }
     );
   }
   // E-Board guards come first — they must take priority over the generic
   // ambassador guard below, which would otherwise fire for formType=eboard/detectedType=ambassador.
   if (detectedType === "eboard" && formType !== "eboard") {
     return NextResponse.json(
       { error: "This file looks like an E-Board form. Please select 'E-Board' as the form type." },
       { status: 400 }
     );
   }
   if (formType === "eboard" && detectedType !== "eboard") {
     return NextResponse.json(
       { error: "This file does not look like an E-Board form, but you selected E-Board. Please check your form type selection." },
       { status: 400 }
     );
   }
   if (formType === "ambassador" && detectedType === "project") {
     return NextResponse.json(
       { error: "This file looks like a Project/Intern form, but you selected Ambassador. Please check your form type selection." },
       { status: 400 }
     );
   }
   if (formType !== "ambassador" && (detectedType === "ambassador" || detectedType === "ambassador_matrix")) {
     return NextResponse.json(
       { error: "This file looks like an Ambassador form, but you selected Project/Intern. Please check your form type selection." },
       { status: 400 }
     );
   }

   // ── Opportunity-family compatibility check ───────────────────────────────
   // Map the incoming form to a broad family bucket.
   // E-Board and all Ambassador subtypes are ambassador-family.
   const incomingFamily = (formType === "ambassador" || formType === "eboard") ? "Ambassador" : "General";

   if (opportunity) {
     const existing = await prisma.application.findFirst({
       where: { opportunity },
       select: { track: true },
     });
     if (existing) {
       // existing.track is "Ambassador" or "General" — set by normalizers at import time
       if (existing.track === "Ambassador" && incomingFamily === "General") {
         return NextResponse.json(
           { error: "This file is a Project/Intern form and cannot be imported into an Ambassador-type opportunity." },
           { status: 400 }
         );
       }
       if (existing.track === "General" && incomingFamily === "Ambassador") {
         return NextResponse.json(
           { error: "This file is an Ambassador-type form and cannot be imported into a Project/Intern opportunity." },
           { status: 400 }
         );
       }
     }
     // existing === null means this is a new opportunity — allow the import
   }

   const cleanData =
     formType === "eboard"
       ? normalizeEboardData(rawParsedData, opportunity)
       : formType === "ambassador" && detectedType === "ambassador_matrix"
       ? normalizeAmbassadorMatrixData(rawParsedData, opportunity)
       : formType === "ambassador"
       ? normalizeAmbassadorData(rawParsedData, opportunity)
       : normalizeData(rawParsedData, opportunity);

   //track insert/skipped counts and collect errors for a summary response
   let inserted = 0;
   let updated = 0;
   let skipped = 0;
   
   const errors: string[] = [];
   
   for (const applicant of cleanData) {
     // skip records flagged invalid during normalization
     if ((applicant as any)._invalid) {
       skipped++;
       errors.push(
         `Skipped row: ${(applicant as any)._reason} — raw: ${JSON.stringify(
           (applicant as any).rawData
         )}`
       );
       continue;
     }

     try {
       const result = await upsertApplicant(applicant);
       //track if upsert inserted or updated
       if (result.isNew) {
       inserted++;}
       else{
        updated++;
       }
     } catch (error) {
       errors.push(`Failed on ${(applicant as any).email}: ${error}`);
       skipped++;
     }
   }

   //provide a concise summary instead of returning all parsed rows
   return NextResponse.json({ inserted, updated, skipped, errors });

    
}

