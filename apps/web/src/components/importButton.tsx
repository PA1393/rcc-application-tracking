"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";



export default function ImportButton() {
    const[importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter(); //AUTO REFRESH PAGE
    // const [result, setResult] = useState<{inserted: number, updated: number, skipped: number, errors: string[]} | null>(null);   //state to hold API response summary



     const activateImport = () => {
    fileInputRef.current?.click();

    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true); // Show uploading state

        const formData = new FormData();
        formData.append("file", file); // Append the file to FormData so we can--> send to API route for processing

        try{
        await fetch("/api/import", { //call  API route to process the CSV
            method: "POST",
            body: formData,
        });

        router.refresh(); // Refresh the page to show new data after import
        
    } catch(error) {
        console.error("Import failed:", error); 
    } finally {
        setImporting(false); // Reset state after upload
        e.target.value = ""; //reset file input for next import
    }};


    return(
       <div>
      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      <button onClick={activateImport} disabled={importing} className="bg-black text-white px-5 py-2 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 transition">
        {importing ? "Uploading..." : "Import CSV"}
      </button>
    </div>
    )

}