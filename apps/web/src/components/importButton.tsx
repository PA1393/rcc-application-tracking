"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const ADD_NEW = "__add_new__";

export default function ImportButton() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [opportunities, setOpportunities] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newOpportunityName, setNewOpportunityName] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Fetch existing opportunity names on mount
  useEffect(() => {
    fetch("/api/applications?opportunities=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOpportunities(data);
      })
      .catch(() => {}); // gracefully handle if not yet wired
  }, []);

  function handleDropdownChange(value: string) {
    if (value === ADD_NEW) {
      setShowNewInput(true);
      setSelectedOpportunity("");
    } else {
      setShowNewInput(false);
      setSelectedOpportunity(value);
    }
  }

  function handleNewOpportunityBlur() {
    const trimmed = newOpportunityName.trim();
    if (!trimmed) return;
    // Optimistically add to dropdown list if not already there
    if (!opportunities.includes(trimmed)) {
      setOpportunities((prev) => [...prev, trimmed]);
    }
    setSelectedOpportunity(trimmed);
    setShowNewInput(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  async function handleImport() {
    if (!selectedFile || !selectedOpportunity) return;

    setImporting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("opportunity", selectedOpportunity);

    try {
      await fetch("/api/import", { method: "POST", body: formData });
      router.refresh();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Import failed:", error);
    } finally {
      setImporting(false);
    }
  }

  const canImport = !!selectedOpportunity && !!selectedFile && !importing;

  return (
    <div className="flex flex-col gap-2 items-end">
      {/* Row: opportunity dropdown + file picker + import button */}
      <div className="flex items-center gap-2">

        {/* 1. Opportunity dropdown */}
        <select
          value={showNewInput ? ADD_NEW : selectedOpportunity}
          onChange={(e) => handleDropdownChange(e.target.value)}
          className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="" disabled>Select opportunity...</option>
          {opportunities.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={ADD_NEW}>+ Add new opportunity</option>
        </select>

        {/* 2. File picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors whitespace-nowrap"
        >
          {selectedFile ? selectedFile.name : "Choose file..."}
        </button>

        {/* 3. Import button */}
        <button
          onClick={handleImport}
          disabled={!canImport}
          className="text-sm px-4 py-2 rounded-lg font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {importing ? "Uploading..." : "Import CSV"}
        </button>
      </div>

      {/* New opportunity text input — shown below the row */}
      {showNewInput && (
        <input
          type="text"
          autoFocus
          value={newOpportunityName}
          onChange={(e) => setNewOpportunityName(e.target.value)}
          onBlur={handleNewOpportunityBlur}
          onKeyDown={(e) => { if (e.key === "Enter") handleNewOpportunityBlur(); }}
          placeholder="Type opportunity name..."
          className="text-sm border border-teal-500/50 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 w-full"
        />
      )}
    </div>
  );
}
