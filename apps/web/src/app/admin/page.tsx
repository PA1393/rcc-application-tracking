"use client";

import { useEffect, useState, useCallback } from "react";
import ImportButton from "@/components/importButton";

// ── Types ────────────────────────────────────────────────────────────────────

type Application = {
  id: string;
  role: string;
  track: string;
  status: string;
  season: string;
  applied_at: string;
  interview_notes: string | null;
  rawData: Record<string, string> | null;
  applicant: { name: string; email: string };
};

const STATUSES = ["To Review", "Interviewing", "Accepted", "Rejected"] as const;
type Status = (typeof STATUSES)[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "To Review":    return "bg-slate-700 text-slate-200";
    case "Interviewing": return "bg-blue-900/60 text-blue-300";
    case "Accepted":     return "bg-teal-900/60 text-teal-300";
    case "Rejected":     return "bg-red-900/40 text-red-400";
    default:             return "bg-slate-700 text-slate-300";
  }
}

function columnAccent(status: Status) {
  switch (status) {
    case "To Review":    return "border-t-slate-500";
    case "Interviewing": return "border-t-blue-500";
    case "Accepted":     return "border-t-teal-400";
    case "Rejected":     return "border-t-red-500";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Applicant Card ────────────────────────────────────────────────────────────

function ApplicantCard({
  app,
  onStatusChange,
}: {
  app: Application;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(app.interview_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  async function handleStatusChange(newStatus: string) {
    setChangingStatus(true);
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: app.id, status: newStatus }),
    });
    setChangingStatus(false);
    onStatusChange(app.id, newStatus);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: app.id, interview_notes: notes }),
    });
    setSavingNotes(false);
  }

  return (
    <div className="bg-[#1a2035] border border-slate-700/50 rounded-lg hover:border-slate-600 transition-colors">
      {/* Card header — always visible */}
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="shrink-0 w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
            <span className="text-xs font-semibold text-teal-300">
              {getInitials(app.applicant.name)}
            </span>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-start gap-2">
              <p className="font-semibold text-slate-100 truncate text-sm">
                {app.applicant.name}
              </p>
              <span className="text-slate-500 text-xs mt-0.5 shrink-0">
                {expanded ? "▲" : "▼"}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{app.applicant.email}</p>
            <p className="text-xs text-slate-500 mt-1">Applied {formatDate(app.applied_at)}</p>
          </div>
        </div>

        {/* Status dropdown */}
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <select
            value={app.status}
            disabled={changingStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`w-full text-xs font-medium rounded px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-offset-0 focus:ring-teal-500 ${statusColor(app.status)}`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-slate-700/50 p-4 space-y-4">
          {/* Raw form responses */}
          {app.rawData && Object.keys(app.rawData).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Form Responses
              </p>
              <div className="space-y-3">
                {Object.entries(app.rawData).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs text-slate-500">{key}</p>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{String(value) || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interview notes */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Interview Notes
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Add notes..."
              className="w-full text-sm bg-[#0f1117] border border-slate-700 text-slate-200 placeholder-slate-600 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {savingNotes && (
              <p className="text-xs text-slate-500 mt-1">Saving...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Board Column ──────────────────────────────────────────────────────────────

function Column({
  status,
  apps,
  onStatusChange,
}: {
  status: Status;
  apps: Application[];
  onStatusChange: (id: string, status: string) => void;
}) {
  return (
    <div className={`flex flex-col min-w-0 bg-[#131929] rounded-xl border-t-2 ${columnAccent(status)} p-4`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{status}</h3>
        <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-2 py-0.5">
          {apps.length}
        </span>
      </div>
      <div className="space-y-3">
        {apps.map((app) => (
          <ApplicantCard key={app.id} app={app} onStatusChange={onStatusChange} />
        ))}
        {apps.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8 border border-dashed border-slate-700/50 rounded-lg">
            No applicants
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch distinct roles on mount
  useEffect(() => {
    fetch("/api/applications?roles=true")
      .then((r) => r.json())
      .then((data: string[]) => {
        setRoles(data);
        if (data.length > 0) setSelectedRole(data[0]);
      });
  }, []);

  // Fetch applications when selected role changes
  useEffect(() => {
    if (!selectedRole) return;
    setLoadingApps(true);
    fetch(`/api/applications?role=${encodeURIComponent(selectedRole)}`)
      .then((r) => r.json())
      .then((data: Application[]) => {
        setApplications(data);
        setLoadingApps(false);
      });
  }, [selectedRole]);

  // Optimistic status update — moves card to new column immediately
  const handleStatusChange = useCallback((id: string, newStatus: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
  }, []);

  const filtered = search.trim()
    ? applications.filter((a) => {
        const q = search.toLowerCase();
        return (
          a.applicant.name.toLowerCase().includes(q) ||
          a.applicant.email.toLowerCase().includes(q)
        );
      })
    : applications;

  const byStatus = (status: Status) =>
    filtered.filter((a) => a.status === status);

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#0f1117" }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Applicant Tracking</h1>
            <p className="text-slate-400 text-sm mt-1">Manage incoming applications by opportunity.</p>
          </div>
          <ImportButton />
        </div>

        {/* Role selector + search */}
        <div className="flex items-center gap-3 mb-6">
          {roles.length === 0 ? (
            <p className="text-sm text-slate-500">No roles found. Import a CSV to get started.</p>
          ) : (
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
          />
        </div>

        {/* Kanban board */}
        {loadingApps ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                apps={byStatus(status)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
