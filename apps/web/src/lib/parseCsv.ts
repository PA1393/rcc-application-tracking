import Papa from "papaparse";

//file is responsible for pasing and normalizaiton of data 


     //define all possible variations of field names for email, name, and role
    const FIELD_MAP = {
        email: ['sjsu email', 'email', 'email address', 'preferred email'],
        name: ['name', 'full name', 'applicant name', 'first and last name'], //check w sheets
        role: ['role', 'position', 'what position are you applying for?', 'which role are you interested in?'] //check w sheets
        };


    export async function parseRawCsv(file: File): Promise<any[]> {
        const csvText = await file.text();


    const results = Papa.parse<any>(csvText, {
        header: true, // first row is header
        skipEmptyLines: true, //skip empty lines
        transformHeader: (header) => header.trim(), //remove whitespace from headers
    });

    return results.data;

    }



    export function normalizeData(rawData: any[]): any[] {

  // Java: for(row : rawData) -> TS: .map()
  return rawData.map((row) => {
    const normalizedRow: any = { 
      rawData: row,
      status: "Applied", // Default status for new imports
      track: "General"   // Default track (you can change this later)
     }; //clean object

    const emailVariations = ['sjsu email', 'email', 'email address']; //modify
    const nameVariations = ['name', 'full name', 'applicant name']; //modify
    const roleVariations = ['role', 'position', 'what position are you applying for?', 'which role are you interested in?']; //modify
    
    // Find which header in the row matches our list
    const rowHeaders = Object.keys(row); 
    
    for (const variation of emailVariations) {
      const matchedHeader = rowHeaders.find(
        (header) => header.toLowerCase().trim() === variation.toLowerCase()
      );

      if (matchedHeader) {
        normalizedRow.email = row[matchedHeader].trim().toLowerCase();
        break; // found best email match
      }
    }

    //name variations
    for (const variation of nameVariations) {
        const matchedHeader = rowHeaders.find(
            (header) => header.toLowerCase().trim() === variation.toLowerCase()
        );

        if (matchedHeader) {
            normalizedRow.name = row[matchedHeader].trim();
            break;
        }
    }

    //role variations
    for (const variation of roleVariations) {
        const matchedHeader = rowHeaders.find(
            (header) => header.toLowerCase().trim() === variation.toLowerCase()
        );

        if (matchedHeader) {
            normalizedRow.role = row[matchedHeader].trim();
            break;
        }
    }

    return normalizedRow; 

  });
}

    