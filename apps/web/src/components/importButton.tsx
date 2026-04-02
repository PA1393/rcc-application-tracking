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

// ── useImportOpportunity hook — exported so page.tsx can wire it up ────────────
export function useImportOpportunity() {
  const [opportunities, setOpportunities] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState("");
  const [showNewInput, setShowNewInput] = useState(false);
  const [newOpportunityName, setNewOpportunityName] = useState("");

  useEffect(() => {
    fetch("/api/applications?opportunities=true")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setOpportunities(data); })
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

  return {
    opportunities,
    selectedOpportunity,
    showNewInput,
    newOpportunityName,
    onDropdownChange: handleDropdownChange,
    onNewOpportunityBlur: handleNewOpportunityBlur,
    onNewOpportunityNameChange: setNewOpportunityName,
    onNewOpportunityKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleNewOpportunityBlur();
    },
  };
}

// ── ImportOpportunitySelector — kept for backwards compat but unused in strip ─
export function ImportOpportunitySelector(_props: {
  opportunities: string[];
  selectedOpportunity: string;
  showNewInput: boolean;
  newOpportunityName: string;
  onDropdownChange: (value: string) => void;
  onNewOpportunityBlur: () => void;
  onNewOpportunityNameChange: (value: string) => void;
  onNewOpportunityKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return null; // rendering is now handled inside ImportButton's popover
}

// ── ImportButton — single trigger button that expands into a panel ─────────────
export default function ImportButton({
  selectedOpportunity: _externalOpportunity,
  onImportSuccess,
  importOpportunity,
}: {
  selectedOpportunity: string;
  onImportSuccess: () => void;
  importOpportunity: ReturnType<typeof useImportOpportunity>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedFormType, setSelectedFormType] = useState<"project" | "ambassador">("project");
  const [detectedFormLabel, setDetectedFormLabel] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setDetectedFormLabel(null);
    if (!file) return;

    const text = await file.text();
    const result = Papa.parse(text, { header: true, preview: 1 });
    const headers = (result.meta.fields ?? []).map((h: string) => h.toLowerCase().trim());

    const isAmbassador = AMBASSADOR_SIGNALS.some((s) => headers.includes(s));
    setSelectedFormType(isAmbassador ? "ambassador" : "project");
    setDetectedFormLabel(isAmbassador ? "Ambassador form detected" : "Project / Intern form detected");
  }

  async function handleImport() {
    const opportunity = importOpportunity.selectedOpportunity;
    if (!selectedFile || !opportunity) return;

    setImporting(true);
    setSummary(null);
    setImportError(null);
    setErrorsExpanded(false);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("opportunity", opportunity);
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
        // Keep panel open to show summary
      } else {
        setImportError((data as { error?: string }).error ?? "Import failed. Please try again.");
      }
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const canImport = !!importOpportunity.selectedOpportunity && !!selectedFile && !importing;

  // Pill input style reused inside panel
  const fieldStyle: React.CSSProperties = {
    background: "#0C0A14",
    border: "0.5px solid rgba(139,130,190,0.12)",
    borderRadius: 8,
    color: "#EAE8F2",
    fontSize: 13,
    padding: "9px 12px",
    width: "100%",
    outline: "none",
  };

  return (
    <div className="relative shrink-0">
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 transition-all"
        style={{
          fontSize: 13,
          fontWeight: 500,
          padding: "7px 14px",
          borderRadius: 7,
          background: open ? "#6B5FCC" : "#1C1930",
          border: `0.5px solid ${open ? "#6B5FCC" : "rgba(139,130,190,0.12)"}`,
          color: open ? "#EAE8F2" : "#A09BB5",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#6B5FCC";
            (e.currentTarget as HTMLButtonElement).style.color = "#EAE8F2";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,130,190,0.12)";
            (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
          }
        }}
      >
        {/* Upload icon */}
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.8 }}>
          <path d="M6 8V2M6 2L3.5 4.5M6 2L8.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1.5 9.5V10.5H10.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Import
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{
            opacity: 0.5,
            transition: "transform 0.18s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* ── Popover panel ── */}
      {open && (
        <div
          ref={panelRef}
          className="rcc-popover absolute right-0 top-full mt-2 z-40"
          style={{
            width: 340,
            background: "#141120",
            border: "0.5px solid rgba(139,130,190,0.15)",
            borderRadius: 12,
            boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(139,130,190,0.08)",
            overflow: "hidden",
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "#EAE8F2" }}>Import CSV</span>
            <button
              onClick={() => setOpen(false)}
              style={{ fontSize: 15, color: "#6A6580", lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6A6580"; }}
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-5">

            {/* Step 1 — Opportunity */}
            <div className="rcc-fade-up" style={{ animationDelay: "0ms" }}>
              <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                1 · Import to
              </p>
              {importOpportunity.showNewInput ? (
                <input
                  type="text"
                  autoFocus
                  value={importOpportunity.newOpportunityName}
                  onChange={(e) => importOpportunity.onNewOpportunityNameChange(e.target.value)}
                  onBlur={importOpportunity.onNewOpportunityBlur}
                  onKeyDown={importOpportunity.onNewOpportunityKeyDown}
                  placeholder="Type opportunity name..."
                  style={{
                    ...fieldStyle,
                    borderColor: "rgba(139,127,238,0.4)",
                  }}
                />
              ) : (
                <select
                  value={importOpportunity.selectedOpportunity}
                  onChange={(e) => importOpportunity.onDropdownChange(e.target.value)}
                  style={{
                    ...fieldStyle,
                    appearance: "none",
                    cursor: "pointer",
                    color: importOpportunity.selectedOpportunity ? "#EAE8F2" : "#6A6580",
                  }}
                >
                  <option value="" disabled>Select opportunity…</option>
                  {importOpportunity.opportunities.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  <option value={ADD_NEW}>+ Add new</option>
                </select>
              )}
            </div>

            {/* Step 2 — Form type */}
            <div className="rcc-fade-up" style={{ animationDelay: "30ms" }}>
              <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                2 · Form type
              </p>
              <div
                className="flex rounded-[8px] p-0.5 gap-0.5"
                style={{
                  background: "#0C0A14",
                  border: "0.5px solid rgba(139,130,190,0.12)",
                }}
              >
                {(["project", "ambassador"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedFormType(type)}
                    className="flex-1 text-center transition-colors"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "7px 0",
                      borderRadius: 6,
                      cursor: "pointer",
                      border: "none",
                      ...(selectedFormType === type
                        ? { background: "#6B5FCC", color: "#EAE8F2" }
                        : { background: "transparent", color: "#6A6580" }),
                    }}
                  >
                    {type === "project" ? "Project / Intern" : "Ambassador"}
                  </button>
                ))}
              </div>
              {detectedFormLabel && (
                <p className="mt-1.5" style={{ fontSize: 11, color: "#8B7FEE", opacity: 0.8 }}>
                  ✓ {detectedFormLabel}
                </p>
              )}
            </div>

            {/* Step 3 — File */}
            <div className="rcc-fade-up" style={{ animationDelay: "60ms" }}>
              <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                3 · CSV file
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 transition-colors"
                style={{
                  ...fieldStyle,
                  textAlign: "left",
                  cursor: "pointer",
                  border: selectedFile
                    ? "0.5px solid rgba(139,127,238,0.3)"
                    : "0.5px dashed rgba(139,130,190,0.2)",
                  color: selectedFile ? "#8B7FEE" : "#6A6580",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                  <path d="M1.5 8.5V9.5H9.5V8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  <path d="M5.5 1.5V7M5.5 1.5L3 4M5.5 1.5L8 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="truncate">
                  {selectedFile ? selectedFile.name : "Choose file…"}
                </span>
              </button>
            </div>

            {/* Error banner */}
            {importError && (
              <div
                className="rcc-fade-up flex items-start justify-between gap-2 px-3 py-2.5 rounded-[6px]"
                style={{
                  background: "rgba(240,96,96,0.08)",
                  borderLeft: "2px solid #F06060",
                  fontSize: 12,
                  color: "#F06060",
                }}
              >
                <span>{importError}</span>
                <button
                  onClick={() => setImportError(null)}
                  style={{ flexShrink: 0, opacity: 0.6, cursor: "pointer", background: "none", border: "none", color: "inherit" }}
                >✕</button>
              </div>
            )}

            {/* Summary banner */}
            {summary && (
              <div
                className="rcc-fade-up rounded-[8px] overflow-hidden"
                style={{
                  background: "rgba(74,222,128,0.06)",
                  border: "0.5px solid rgba(74,222,128,0.2)",
                  fontSize: 12,
                }}
              >
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex gap-3">
                    <span style={{ color: "#4ADE80" }}>{summary.inserted} inserted</span>
                    <span style={{ color: "#6B9EF7" }}>{summary.updated} updated</span>
                    <span style={{ color: "#F0B040" }}>{summary.skipped} skipped</span>
                  </div>
                  <button
                    onClick={() => setSummary(null)}
                    style={{ color: "#6A6580", cursor: "pointer", background: "none", border: "none" }}
                  >✕</button>
                </div>
                {summary.errors.length > 0 && (
                  <div style={{ borderTop: "0.5px solid rgba(139,130,190,0.08)" }}>
                    <button
                      onClick={() => setErrorsExpanded((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2"
                      style={{ fontSize: 12, color: "#F06060", cursor: "pointer", background: "none", border: "none" }}
                    >
                      <span>{summary.errors.length} row{summary.errors.length !== 1 ? "s" : ""} with errors</span>
                      <span style={{ color: "#6A6580", fontSize: 10 }}>{errorsExpanded ? "▲" : "▼"}</span>
                    </button>
                    {errorsExpanded && (
                      <ul className="px-3 pb-2 space-y-1 max-h-24 overflow-y-auto">
                        {summary.errors.map((err, i) => (
                          <li key={i} style={{ fontSize: 10, color: "rgba(240,96,96,0.8)", lineHeight: 1.4 }}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="rcc-fade-up w-full transition-all"
              style={{
                animationDelay: "90ms",
                fontSize: 13,
                fontWeight: 500,
                padding: "10px 0",
                borderRadius: 8,
                border: "none",
                cursor: canImport ? "pointer" : "not-allowed",
                background: canImport ? "#6B5FCC" : "rgba(107,95,204,0.2)",
                color: canImport ? "#EAE8F2" : "#6A6580",
                opacity: importing ? 0.7 : 1,
                transition: "background 0.15s, color 0.15s, opacity 0.15s",
              }}
              onMouseEnter={(e) => {
                if (canImport) (e.currentTarget as HTMLButtonElement).style.background = "#7C6FDC";
              }}
              onMouseLeave={(e) => {
                if (canImport) (e.currentTarget as HTMLButtonElement).style.background = "#6B5FCC";
              }}
            >
              {importing ? "Uploading…" : "Import CSV"}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}
