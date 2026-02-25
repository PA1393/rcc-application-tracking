import Papa from "papaparse";



    export async function parseRawCsv(file: File): Promise<any[]> {

        const csvText = await file.text();

    const results = Papa.parse<any>(csvText, {
        header: true, // first row is header
        skipEmptyLines: true, //skip empty lines
        transformHeader: (header) => header.trim(), //remove whitespace from headers
    });

    return results.data;

    }

    