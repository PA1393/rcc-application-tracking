"use client";

import { useEffect, useState, useCallback } from "react";
import ImportButton from "@/components/importButton";
import { getEmailTemplate } from "@/lib/emailTemplates";

// ── Types ────────────────────────────────────────────────────────────────────

type Application = {
  id: string;
  applicant_id: string;
  role: string;
  opportunity: string;
  track: string;
  status: string;
  season: string;
  applied_at: string;
  interview_notes: string | null;
  interview_invite_sent: string | null;
  acceptance_sent_at: string | null;
  rejection_sent_at: string | null;
  rawData: Record<string, string> | null;
  applicant: { name: string; email: string };
};

const STATUSES = ["To Review", "Interviewing", "Rejected", "Accepted"] as const;
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

/** Returns the timestamp field value for the email associated with a given status. */
function statusToSentAt(status: string, app: Application): string | null {
  switch (status) {
    case "Interviewing": return app.interview_invite_sent;
    case "Accepted":     return app.acceptance_sent_at;
    case "Rejected":     return app.rejection_sent_at;
    default:             return null;
  }
}

const EMAIL_STATUSES = ["Interviewing", "Accepted", "Rejected"] as const;

// ── Email Draft Modal ─────────────────────────────────────────────────────────

function EmailDraftModal({
  app,
  status,
  onSent,
}: {
  app: Application;
  status: string;
  onSent: () => void;
}) {
  const template = getEmailTemplate(status, {
    name: app.applicant.name,
    role: app.role,
    opportunity: app.opportunity,
  });

  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadySentAt = statusToSentAt(status, app);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id, subject, body }),
      });
      const data = await res.json();
      if (res.ok || res.status === 409) {
        // 409 = already sent (we showed the warning) — still close the modal
        onSent();
      } else {
        setError(data.error ?? "Failed to send email.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-[#131929] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-700/50 shadow-2xl">

        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 shrink-0">
          <h3 className="text-base font-bold text-white">Send Email — {status}</h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Review and send email to{" "}
            <span className="text-slate-200">{app.applicant.name}</span>
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Already-sent warning */}
          {alreadySentAt && (
            <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-lg px-4 py-3">
              <p className="text-sm text-yellow-300">
                An email was already sent for this status on{" "}
                <span className="font-semibold">{formatDate(alreadySentAt)}</span>.
                Sending again will not update the timestamp.
              </p>
            </div>
          )}

          {/* Send error */}
          {error && (
            <div className="bg-red-900/30 border border-red-600/40 rounded-lg px-4 py-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* To (read-only) */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</p>
            <p className="text-sm text-slate-300 bg-[#0f1117] border border-slate-700 rounded-lg px-3 py-2">
              {app.applicant.email}
            </p>
          </div>

          {/* Subject */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Subject</p>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-sm bg-[#0f1117] border border-slate-700 text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Body */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Body</p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full text-sm bg-[#0f1117] border border-slate-700 text-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700/50 shrink-0">
          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full text-sm font-semibold py-2.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Applicant Modal ───────────────────────────────────────────────────────────

const ACTION_STATUSES = ["Interviewing", "Accepted", "Rejected"] as const;

function statusButtonStyle(status: string) {
  switch (status) {
    case "Interviewing": return "bg-blue-800/60 text-blue-200 hover:bg-blue-700/60 border border-blue-700/50";
    case "Accepted":     return "bg-teal-800/60 text-teal-200 hover:bg-teal-700/60 border border-teal-700/50";
    case "Rejected":     return "bg-red-800/40 text-red-300 hover:bg-red-700/40 border border-red-700/40";
    default:             return "bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600";
  }
}

function ApplicantModal({
  initialApp,
  onClose,
  onStatusChange,
}: {
  initialApp: Application;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [allApps, setAllApps] = useState<Application[]>([initialApp]);
  const [activeTab, setActiveTab] = useState(initialApp.id);
  const [notes, setNotes] = useState(initialApp.interview_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [emailDraftStatus, setEmailDraftStatus] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Fetch all applications for this applicant
  useEffect(() => {
    fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
      .then((r) => r.json())
      .then((data: Application[]) => setAllApps(data));
  }, [initialApp.applicant_id]);

  // Sync notes textarea when switching tabs or when allApps loads
  useEffect(() => {
    const app = allApps.find((a) => a.id === activeTab) ?? initialApp;
    setNotes(app.interview_notes ?? "");
  }, [activeTab, allApps]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  // Close on Escape — suppressed when email draft or confirmation is open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (emailDraftStatus) return; // email modal has no dismiss
        if (pendingStatus) setPendingStatus(null);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pendingStatus, emailDraftStatus]);

  const activeApp = allApps.find((a) => a.id === activeTab) ?? initialApp;

  async function saveNotes() {
    setSavingNotes(true);
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, interview_notes: notes }),
    });
    setSavingNotes(false);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setChangingStatus(true);

    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, status: pendingStatus }),
    });

    const confirmedStatus = pendingStatus;

    // Optimistically update local allApps so the badge reflects the change
    setAllApps((prev) =>
      prev.map((a) => (a.id === activeApp.id ? { ...a, status: confirmedStatus } : a))
    );
    onStatusChange(activeApp.id, confirmedStatus);
    setPendingStatus(null);
    setChangingStatus(false);

    // Open email draft for email-eligible statuses
    if ((EMAIL_STATUSES as readonly string[]).includes(confirmedStatus)) {
      setEmailDraftStatus(confirmedStatus);
    }
  }

  return (
    <>
      {/* Email draft modal — rendered above the applicant modal */}
      {emailDraftStatus && (
        <EmailDraftModal
          app={activeApp}
          status={emailDraftStatus}
          onSent={() => {
            setEmailDraftStatus(null);
            setToastVisible(true);
          }}
        />
      )}

      {/* Success toast */}
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-teal-700 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg">
          Email sent successfully
        </div>
      )}

      {/* Backdrop — click outside to close (suppressed while email draft is open) */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        onClick={() => { if (!pendingStatus && !emailDraftStatus) onClose(); }}
      >
        {/* Modal panel — stop propagation */}
        <div
          className="relative bg-[#131929] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-700/50 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Confirmation overlay */}
          {pendingStatus && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
              <div className="bg-[#1a2035] border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                <p className="text-white text-sm leading-relaxed mb-5">
                  Are you sure you want to change{" "}
                  <span className="text-teal-300 font-semibold">{initialApp.applicant.name}</span>'s
                  status to{" "}
                  <span className="font-bold">{pendingStatus}</span>?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setPendingStatus(null)}
                    className="text-sm px-4 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmStatusChange}
                    disabled={changingStatus}
                    className="text-sm px-4 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                  >
                    {changingStatus ? "Saving..." : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-teal-300">
                  {getInitials(initialApp.applicant.name)}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">
                  {initialApp.applicant.name}
                </h2>
                <p className="text-sm text-slate-400">{initialApp.applicant.email}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor(activeApp.status)}`}>
                {activeApp.status}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none ml-4"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 pt-3 border-b border-slate-700/50">
            {allApps.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveTab(a.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                  activeTab === a.id
                    ? "text-teal-300 border-teal-400 bg-[#0f1117]/40"
                    : "text-slate-500 border-transparent hover:text-slate-300"
                }`}
              >
                {a.role}
              </button>
            ))}
          </div>

          {/* Scrollable tab content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* Q&A cards */}
            {activeApp.rawData && Object.keys(activeApp.rawData).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(activeApp.rawData).map(([question, answer]) => (
                  <div
                    key={question}
                    className="bg-[#0f1117] rounded-lg p-4 border border-slate-700/40"
                  >
                    <p className="text-xs text-slate-500 mb-1">{question}</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {String(answer) || "—"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600 italic">No form responses recorded.</p>
            )}

            {/* Notes */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Interview Notes
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={4}
                placeholder="Add notes..."
                className="w-full text-sm bg-[#0f1117] border border-slate-700 text-slate-200 placeholder-slate-600 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {savingNotes && (
                <p className="text-xs text-slate-500 mt-1">Saving...</p>
              )}
            </div>

            {/* Change Status */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Change Status
              </p>
              <div className="flex gap-2 flex-wrap">
                {ACTION_STATUSES.filter((s) => s !== activeApp.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPendingStatus(s)}
                    className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${statusButtonStyle(s)}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

// ── Applicant Card ────────────────────────────────────────────────────────────

function ApplicantCard({
  app,
  onOpen,
}: {
  app: Application;
  onOpen: (app: Application) => void;
}) {
  return (
    <div
      className="bg-[#1a2035] border border-slate-700/50 rounded-lg hover:border-slate-600 transition-colors cursor-pointer select-none"
      onClick={() => onOpen(app)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="shrink-0 w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
            <span className="text-xs font-semibold text-teal-300">
              {getInitials(app.applicant.name)}
            </span>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 truncate text-sm">{app.applicant.name}</p>
            <p className="text-xs text-slate-400 truncate">{app.applicant.email}</p>
            <p className="text-xs text-slate-500 mt-1">Applied {formatDate(app.applied_at)}</p>
          </div>
        </div>

        {/* Static status badge */}
        <div className="mt-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor(app.status)}`}>
            {app.status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Board Column ──────────────────────────────────────────────────────────────

function Column({
  status,
  apps,
  onOpen,
}: {
  status: Status;
  apps: Application[];
  onOpen: (app: Application) => void;
}) {
  return (
    <div className={`flex flex-col min-w-0 bg-[#131929] rounded-xl border-t-2 ${columnAccent(status)} p-4 overflow-hidden`}>
      {/* Sticky column header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{status}</h3>
        <span className="text-xs bg-slate-700/60 text-slate-400 rounded-full px-2 py-0.5">
          {apps.length}
        </span>
      </div>
      {/* Scrollable card list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
        {apps.map((app) => (
          <ApplicantCard key={app.id} app={app} onOpen={onOpen} />
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
  const [opportunities, setOpportunities] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<string>("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Fetch distinct opportunities on mount
  useEffect(() => {
    fetch("/api/applications?opportunities=true")
      .then((r) => r.json())
      .catch(() => [])
      .then((data: string[]) => {
        setOpportunities(data);
        if (data.length > 0) setSelectedOpportunity(data[0]);
      });
  }, []);

  // Fetch applications when selected opportunity changes
  useEffect(() => {
    if (!selectedOpportunity) return;
    setLoadingApps(true);
    fetch(`/api/applications?opportunity=${encodeURIComponent(selectedOpportunity)}`)
      .then((r) => r.json())
      .catch(() => [])
      .then((data: Application[]) => {
        setApplications(data);
        setLoadingApps(false);
      });
  }, [selectedOpportunity]);

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
    <main className="h-screen overflow-hidden flex flex-col p-8" style={{ backgroundColor: "#0f1117" }}>
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center mb-8 shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Applicant Tracking</h1>
            <p className="text-slate-400 text-sm mt-1">Manage incoming applications by opportunity.</p>
          </div>
          <ImportButton />
        </div>

        {/* Opportunity selector + search */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          {opportunities.length === 0 ? (
            <p className="text-sm text-slate-500">No opportunities found. Import a CSV to get started.</p>
          ) : (
            <select
              value={selectedOpportunity}
              onChange={(e) => setSelectedOpportunity(e.target.value)}
              className="text-sm border border-slate-700 rounded-lg px-3 py-2 bg-[#1a2035] text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {opportunities.map((o) => (
                <option key={o} value={o}>{o}</option>
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
          <div className="grid grid-cols-4 gap-4 flex-1 overflow-hidden">
            {STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                apps={byStatus(status)}
                onOpen={setSelectedApp}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full-page modal */}
      {selectedApp && (
        <ApplicantModal
          initialApp={selectedApp}
          onClose={() => setSelectedApp(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  );
}
