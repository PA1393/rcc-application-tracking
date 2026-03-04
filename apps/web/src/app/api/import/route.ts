import { normalizeData, parseRawCsv } from "@/lib/parseCsv";
import { upsertApplicant } from "@/lib/upsert";
import { NextResponse } from "next/server";
 //because applicant responses can be very long, Papaparse can handle long paragraph responses without columns breaking 


export async function POST(request: Request) {  

    const formData = await request.formData();

    //recieve uploaded CSV file
    const file = formData.get("file") as File;

    if (!file) { //validate
        return NextResponse.json({ error: "No File Uploaded or File Error"} , { status: 400 });
    }

   const rawParsedData = await parseRawCsv(file);
   const cleanData = normalizeData(rawParsedData); 

   //track insert/skipped counts and collect errors for a summary response
   let inserted = 0;
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
       await upsertApplicant(applicant);
       inserted++;
     } catch (error) {
       errors.push(`Failed on ${(applicant as any).email}: ${error}`);
       skipped++;
     }
   }

   //provide a concise summary instead of returning all parsed rows
   return NextResponse.json({ inserted, skipped, errors });

    
}

