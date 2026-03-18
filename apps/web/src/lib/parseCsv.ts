import Papa from "papaparse";

//file is responsible for parsing and normalization of data 

    export async function parseRawCsv(file: File): Promise<any[]> {
        const csvText = await file.text();

        

    const results = Papa.parse<any>(csvText, {
        header: true, // first row is header
        skipEmptyLines: true, //skip empty lines
        transformHeader: (header) => header.trim(), //remove whitespace from headers
    });

    return results.data;

    }



    export function normalizeData(rawData: any[], opportunity: string = ""): any[] {

  // Java: for(row : rawData) -> TS: .map()
  return rawData.map((row) => {
    const normalizedRow: any =
    {
      rawData: row,
      opportunity,        // stamp opportunity on every row
      status: "Applied",  // Default status for new imports
      track: "General"    // Default track (you can change this later)
     }; //clean object


    
    const emailVariations = ['sjsu email', 'email', 'email address', 'Email Address', 'SJSU Email Address']; 
    const nameVariations = ['name', 'full name', 'Full Name (First Last)', 'Full Name (First and Last)', 'applicant name', "what is your first and last name?"]; //modify
    const roleVariations = ['role', 'position','Which project are you applying for?', 'what position are you applying for?', 'which role are you interested in?', 'Which Position Are You Interested In? Details on roles available!']; //modify
    
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

    // mark row invalid if essential fields are missing
    if (!normalizedRow.email || !normalizedRow.name) {
      normalizedRow._invalid = true;
      normalizedRow._reason = "Missing email or name";
    }

    return normalizedRow; 

  });
}

    