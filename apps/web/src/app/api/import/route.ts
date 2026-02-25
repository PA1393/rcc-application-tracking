import { parseRawCsv } from "@/lib/parseCsv";
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
    


}

