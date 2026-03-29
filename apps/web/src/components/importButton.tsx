"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";

const ADD_NEW = "__add_new__";

const AMBASSADOR_SIGNALS = [
  "what position are you applying for?",
  "enter your #1 ambassador team preference:",
  "enter your #1 lead ambassador team preference:",
  "what team(s) are you applying for as an ambassador?",
];

type ImportSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export default function ImportButton({
  onImportSuccess,
}: {
  onImportSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [opportunities, setOpportunities] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newOpportunityName, setNewOpportunityName] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<"project" | "ambassador">("project");

  const [detectedFormLabel, setDetectedFormLabel] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // Fetch existing opportunity names on mount
  useEffect(() => {
    fetch("/api/applications?opportunities=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setOpportunities(data);
      })
      .catch(() => {});
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
    if (!opportunities.includes(trimmed)) {
      setOpportunities((prev) => [...prev, trimmed]);
    }
    setSelectedOpportunity(trimmed);
    setShowNewInput(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setDetectedFormLabel(null);

    if (!file) return;

    // Read just the first row to detect which form the CSV came from
    const text = await file.text();
    const result = Papa.parse(text, { header: true, preview: 1 });
    const headers = (result.meta.fields ?? []).map((h: string) => h.toLowerCase().trim());

    const isAmbassador = AMBASSADOR_SIGNALS.some((s) => headers.includes(s));
    setSelectedFormType(isAmbassador ? "ambassador" : "project");
    setDetectedFormLabel(isAmbassador ? "Detected: Ambassador form" : "Detected: Project / Intern form");
  }

  async function handleImport() {
    if (!selectedFile || !selectedOpportunity) return;

    setImporting(true);
    setSummary(null);
    setImportError(null);
    setErrorsExpanded(false);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("opportunity", selectedOpportunity);
    formData.append("formType", selectedFormType);

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setSummary(data as ImportSummary);
        onImportSuccess();
        setSelectedFile(null);
        setDetectedFormLabel(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        // Surface the backend's error message (mismatch errors, 400s, etc.)
        setImportError((data as { error?: string }).error ?? "Import failed. Please try again.");
      }
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const canImport = !!selectedOpportunity && !!selectedFile && !importing;

  return (
    <div className="flex flex-col gap-2 items-end">
      {/* Form type toggle — determines which normalizer runs on the backend */}
      <div className="flex rounded-md border border-slate-700 bg-[#0f1117] p-0.5 gap-0.5">
        {(["project", "ambassador"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setSelectedFormType(type)}
            className={`text-xs px-3 py-1 rounded font-medium transition-colors whitespace-nowrap ${
              selectedFormType === type
                ? "bg-slate-600 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {type === "project" ? "Project / Intern" : "Ambassador"}
          </button>
        ))}
      </div>

      {/* Row: opportunity dropdown + file picker + import button */}
      <div className="flex items-center gap-2">

        {/* 1. Opportunity dropdown */}
        <select
          value={showNewInput ? ADD_NEW : selectedOpportunity}
          onChange={(e) => handleDropdownChange(e.target.value)}
          className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-[#1a2035] text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 max-w-[160px]"
        >
          <option value="" disabled>Select opportunity...</option>
          {opportunities.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value={ADD_NEW}>+ Add new</option>
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
          className="text-xs border border-slate-700 rounded-md px-2 py-1.5 bg-[#1a2035] text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors whitespace-nowrap max-w-[120px] truncate"
        >
          {selectedFile ? selectedFile.name : "Choose file..."}
        </button>

        {/* 3. Import button */}
        <button
          onClick={handleImport}
          disabled={!canImport}
          className="text-xs px-3 py-1.5 rounded-md font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {importing ? "Uploading..." : "Import CSV"}
        </button>
      </div>

      {/* Auto-detect hint — shown after a file is selected */}
      {detectedFormLabel && (
        <p className="text-xs text-slate-500">{detectedFormLabel}</p>
      )}

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
          className="text-xs border border-teal-500/50 rounded-md px-2 py-1.5 bg-[#1a2035] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 w-full"
        />
      )}

      {/* Import error banner — shown for API-level rejections (e.g. form type mismatch) */}
      {importError && (
        <div className="w-full flex items-start justify-between gap-3 rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          <span>{importError}</span>
          <button
            onClick={() => setImportError(null)}
            className="shrink-0 text-red-500 hover:text-red-300 transition-colors leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Import summary banner */}
      {summary && (
        <div className="w-full rounded-lg border border-slate-700/60 bg-[#1a2035] text-xs overflow-hidden">
          {/* Summary counts row */}
          <div className="flex items-center justify-between gap-4 px-3 py-2">
            <div className="flex items-center gap-4">
              <span className="text-teal-400 font-medium">{summary.inserted} inserted</span>
              <span className="text-blue-400 font-medium">{summary.updated} updated</span>
              <span className="text-amber-400 font-medium">{summary.skipped} skipped</span>
            </div>
            <button
              onClick={() => setSummary(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors leading-none ml-2"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>

          {/* Expandable errors list */}
          {summary.errors.length > 0 && (
            <div className="border-t border-slate-700/50">
              <button
                onClick={() => setErrorsExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-red-400 hover:text-red-300 transition-colors"
              >
                <span>{summary.errors.length} row{summary.errors.length !== 1 ? "s" : ""} with errors</span>
                <span className="text-slate-500">{errorsExpanded ? "▲" : "▼"}</span>
              </button>
              {errorsExpanded && (
                <ul className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto">
                  {summary.errors.map((err, i) => (
                    <li key={i} className="text-red-400/80 leading-snug">
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
