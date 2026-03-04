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

   //after normalizing data, we can upsert applicants to database and return summary of import results (e.g. how many new applicants, how many updated, any errors, etc.)

   for(const applicant of cleanData) {

    try {
        const result = await upsertApplicant(applicant);
    }

    catch(error) {
        console.error('Error upserting applicant:' + applicant.name )

    }
   }

   return NextResponse.json({ data: cleanData }); //return import summary JSON

    
}

