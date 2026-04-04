import { normalizeData, normalizeAmbassadorData, parseRawCsv, detectCsvFormType } from "@/lib/parseCsv";
import { upsertApplicant } from "@/lib/upsert";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
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
   if (formType === "ambassador" && detectedType === "project") {
     return NextResponse.json(
       { error: "This file looks like a Project/Intern form, but you selected Ambassador. Please check your form type selection." },
       { status: 400 }
     );
   }
   if (formType !== "ambassador" && detectedType === "ambassador") {
     return NextResponse.json(
       { error: "This file looks like an Ambassador form, but you selected Project/Intern. Please check your form type selection." },
       { status: 400 }
     );
   }

   const cleanData = formType === "ambassador"
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

