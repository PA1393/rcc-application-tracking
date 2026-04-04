"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import ImportButton, {
  useImportOpportunity,
} from "@/components/importButton";
import { getEmailTemplate } from "@/lib/emailTemplates";
import ManageAccessModal from "@/components/ManageAccessModal";

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
  application_notes: string | null;
  interview_notes: string | null;
  decision_notes: string | null;
  interview_invite_sent: string | null;
  acceptance_sent_at: string | null;
  rejection_sent_at: string | null;
  rawData: Record<string, string> | null;
  applicant: { name: string; email: string };
};

const STATUSES = ["To Review", "Interviewing", "Rejected", "Accepted"] as const;
type Status = (typeof STATUSES)[number];

// ── Color system CSS vars applied inline ─────────────────────────────────────
// Page base:     #0C0A14
// Surface:       #141120
// Card:          #1C1930
// Elevated:      #242040
// Brand purple:  #8B7FEE
// Brand dim:     #6B5FCC
// Text primary:  #EAE8F2
// Text secondary:#A09BB5
// Text muted:    #6A6580
// Border:        rgba(139,130,190,0.12)

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "To Review":    return { background: "rgba(107,158,247,0.12)", color: "#6B9EF7" };
    case "Interviewing": return { background: "rgba(240,176,64,0.12)",  color: "#F0B040" };
    case "Accepted":     return { background: "rgba(74,222,128,0.12)",  color: "#4ADE80" };
    case "Rejected":     return { background: "rgba(240,96,96,0.12)",   color: "#F06060" };
    default:             return { background: "rgba(160,155,181,0.12)", color: "#A09BB5" };
  }
}

function columnBarColor(status: Status): string {
  switch (status) {
    case "To Review":    return "#6B9EF7";
    case "Interviewing": return "#F0B040";
    case "Accepted":     return "#4ADE80";
    case "Rejected":     return "#F06060";
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusToSentAt(status: string, app: Application): string | null {
  switch (status) {
    case "Interviewing": return app.interview_invite_sent;
    case "Accepted":     return app.acceptance_sent_at;
    case "Rejected":     return app.rejection_sent_at;
    default:             return null;
  }
}

const EMAIL_STATUSES = ["Interviewing", "Accepted", "Rejected"] as const;

const AMBASSADOR_TEAMS = [
  "Consulting Team",
  "Industry Relations Team",
  "Case Competition Team",
  "Membership Outreach Team",
  "Workshops Team",
  "Journalism Team",
  "Digital Marketing Team",
  "Graphic Design Team",
  "Finance Team",
  "Web Development Team",
  "Growth Analytics Team",
] as const;

// ── Notes tab helpers ─────────────────────────────────────────────────────────

type NoteField = "application_notes" | "interview_notes" | "decision_notes";

const NOTE_TABS: { field: NoteField; label: string; placeholder: string }[] = [
  { field: "application_notes", label: "Application Notes", placeholder: "Add notes about this application..." },
  { field: "interview_notes",   label: "Interview Notes",   placeholder: "Add notes from the interview..." },
  { field: "decision_notes",    label: "Decision Notes",    placeholder: "Add reasoning for the final decision..." },
];

function visibleNoteFields(app: Application): NoteField[] {
  const s = app.status;
  return NOTE_TABS
    .filter(({ field }) => {
      if (field === "application_notes") return true;
      if (field === "interview_notes") {
        return ["Interviewing", "Accepted", "Rejected"].includes(s) || !!app.interview_notes?.trim();
      }
      return ["Accepted", "Rejected"].includes(s) || !!app.decision_notes?.trim();
    })
    .map(({ field }) => field);
}

// ── Shared input style for modals ────────────────────────────────────────────
const modalInputCls =
  "w-full text-sm rounded-[8px] px-3 py-2 focus:outline-none transition-colors";
const modalInputStyle: React.CSSProperties = {
  background: "#1C1930",
  border: "0.5px solid rgba(139,130,190,0.12)",
  color: "#EAE8F2",
};

// ── Email Draft Modal ─────────────────────────────────────────────────────────

function EmailDraftModal({
  app,
  status,
  onSent,
  canCancel,
  onCancel,
}: {
  app: Application;
  status: string;
  onSent: (wasSent: boolean) => void;
  canCancel: boolean;
  onCancel: () => Promise<void>;
}) {
  const template = getEmailTemplate(status, {
    name: app.applicant.name,
    role: app.role,
    opportunity: app.opportunity,
  });

  const [to, setTo] = useState(app.applicant.email);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [sending, setSending] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelWarning, setCancelWarning] = useState<string | null>(null);

  const alreadySentAt = statusToSentAt(status, app);

  async function handleCancel() {
    if (!canCancel) {
      setCancelWarning(
        "Accepted status cannot be canceled because placements have already been processed. Please contact the system administrator."
      );
      return;
    }
    setCanceling(true);
    await onCancel();
    setCanceling(false);
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id, subject, body, to }),
      });
      const data = await res.json();
      if (res.ok) {
        onSent(true);
      } else if (res.status === 409) {
        onSent(false);
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
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        style={{ background: "#141120", border: "0.5px solid rgba(139,130,190,0.12)", borderRadius: 12 }}
      >
        {/* Header */}
        <div className="px-6 py-5 shrink-0" style={{ borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#EAE8F2", lineHeight: 1.3 }}>Send Email — {status}</h3>
          <p className="mt-0.5" style={{ fontSize: 13, color: "#6A6580" }}>
            To: <span style={{ color: "#A09BB5" }}>{app.applicant.name}</span>
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Already-sent warning */}
          {alreadySentAt && (
            <div
              className="px-4 py-3"
              style={{
                background: "rgba(240,176,64,0.08)",
                borderLeft: "3px solid #F0B040",
                borderRadius: 6,
              }}
            >
              <p style={{ fontSize: 13, color: "#F0B040" }}>
                An email was already sent for this status on{" "}
                <span className="font-semibold">{formatDate(alreadySentAt)}</span>.
                Sending again will not update the timestamp.
              </p>
            </div>
          )}

          {/* Cancel-blocked warning */}
          {cancelWarning && (
            <div
              className="px-4 py-3"
              style={{
                background: "rgba(240,176,64,0.08)",
                borderLeft: "3px solid #F0B040",
                borderRadius: 6,
              }}
            >
              <p style={{ fontSize: 13, color: "#F0B040" }}>{cancelWarning}</p>
            </div>
          )}

          {/* Send error */}
          {error && (
            <div
              className="px-4 py-3"
              style={{
                background: "rgba(240,96,96,0.08)",
                borderLeft: "3px solid #F06060",
                borderRadius: 6,
              }}
            >
              <p style={{ fontSize: 13, color: "#F06060" }}>{error}</p>
            </div>
          )}

          <div>
            <p className="mb-1.5 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>To</p>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={modalInputCls}
              style={modalInputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#6B5FCC"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(139,130,190,0.12)"; }}
            />
          </div>

          <div>
            <p className="mb-1.5 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>Subject</p>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={modalInputCls}
              style={modalInputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#6B5FCC"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(139,130,190,0.12)"; }}
            />
          </div>

          <div>
            <p className="mb-1.5 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>Body</p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className={`${modalInputCls} resize-none`}
              style={{ ...modalInputStyle, color: "#EAE8F2" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#6B5FCC"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(139,130,190,0.12)"; }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex gap-3" style={{ borderTop: "0.5px solid rgba(139,130,190,0.08)" }}>
          <button
            onClick={handleCancel}
            disabled={sending || canceling}
            className="flex-1 text-sm font-medium py-2.5 rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ border: "0.5px solid rgba(139,130,190,0.12)", color: "#A09BB5", background: "transparent" }}
          >
            {canceling ? "Reverting..." : "Cancel"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || canceling}
            className="flex-1 text-sm font-medium py-2.5 rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "#6B5FCC", color: "#EAE8F2" }}
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

// All status-change buttons share a neutral base; hover is handled inline
const statusButtonBase: React.CSSProperties = {
  background: "#1C1930",
  border: "0.5px solid rgba(139,130,190,0.12)",
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 12,
  color: "#A09BB5",
  cursor: "pointer",
  transition: "border-color 0.15s, color 0.15s",
};

function ApplicantModal({
  initialApp,
  onClose,
  onStatusChange,
  onRefreshBoard,
  boardOpportunity,
}: {
  initialApp: Application;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onRefreshBoard: () => void;
  boardOpportunity: string;
}) {
  const [allApps, setAllApps] = useState<Application[]>([initialApp]);
  const [activeTab, setActiveTab] = useState(initialApp.id);
  const [activeNotesTab, setActiveNotesTab] = useState<NoteField>("application_notes");
  const [noteDrafts, setNoteDrafts] = useState({
    application_notes: initialApp.application_notes ?? "",
    interview_notes:   initialApp.interview_notes   ?? "",
    decision_notes:    initialApp.decision_notes    ?? "",
  });
  const [savingNotes, setSavingNotes] = useState(false);
  const { data: modalSession } = useSession();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [emailDraftStatus, setEmailDraftStatus] = useState<string | null>(null);
  const [previousEmailStatus, setPreviousEmailStatus] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
      .then((r) => r.json())
      .then((data: Application[]) => setAllApps(data));
  }, [initialApp.applicant_id]);

  useEffect(() => {
    const app = allApps.find((a) => a.id === activeTab) ?? initialApp;
    setActiveNotesTab("application_notes");
    setNoteDrafts({
      application_notes: app.application_notes ?? "",
      interview_notes:   app.interview_notes   ?? "",
      decision_notes:    app.decision_notes    ?? "",
    });
  }, [activeTab, allApps]);

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (emailDraftStatus) return;
        if (pendingStatus) setPendingStatus(null);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pendingStatus, emailDraftStatus]);

  const activeApp = allApps.find((a) => a.id === activeTab) ?? initialApp;
  const visibleFields = visibleNoteFields(activeApp);
  const activeField: NoteField = visibleFields.includes(activeNotesTab) ? activeNotesTab : "application_notes";

  async function saveNotes() {
    setSavingNotes(true);
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, [activeField]: noteDrafts[activeField] }),
    });
    setSavingNotes(false);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setChangingStatus(true);

    const previousStatus = activeApp.status;

    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, status: pendingStatus }),
    });

    const confirmedStatus = pendingStatus;

    setAllApps((prev) =>
      prev.map((a) => (a.id === activeApp.id ? { ...a, status: confirmedStatus } : a))
    );
    onStatusChange(activeApp.id, confirmedStatus);
    setPendingStatus(null);
    setChangingStatus(false);

    if ((EMAIL_STATUSES as readonly string[]).includes(confirmedStatus)) {
      setPreviousEmailStatus(previousStatus);
      setEmailDraftStatus(confirmedStatus);
    }
  }

  async function handleEmailCancel() {
    if (!previousEmailStatus) return;
    await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, status: previousEmailStatus }),
    });
    const reverted = previousEmailStatus;
    setAllApps((prev) =>
      prev.map((a) => (a.id === activeApp.id ? { ...a, status: reverted } : a))
    );
    onStatusChange(activeApp.id, reverted);
    setEmailDraftStatus(null);
    setPreviousEmailStatus(null);
  }

  const activeStatusColor = statusColor(activeApp.status);

  return (
    <>
      {emailDraftStatus && (
        <EmailDraftModal
          app={activeApp}
          status={emailDraftStatus}
          canCancel={emailDraftStatus !== "Accepted"}
          onCancel={handleEmailCancel}
          onSent={(wasSent) => {
            setEmailDraftStatus(null);
            if (wasSent) setToastVisible(true);
            onRefreshBoard();
            fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
              .then((r) => r.json())
              .then((data: Application[]) => setAllApps(data));
          }}
        />
      )}

      {/* Success toast */}
      {toastVisible && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] text-sm font-medium px-5 py-2.5 shadow-lg"
          style={{
            background: "rgba(74,222,128,0.12)",
            color: "#4ADE80",
            borderRadius: 8,
            border: "0.5px solid rgba(74,222,128,0.25)",
          }}
        >
          Email sent successfully
        </div>
      )}

      {/* Backdrop */}
      <div
        className="rcc-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={() => { if (!pendingStatus && !emailDraftStatus) onClose(); }}
      >
        {/* Modal panel */}
        <div
          className="rcc-modal-panel relative w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
          style={{ background: "#141120", border: "0.5px solid rgba(139,130,190,0.12)", borderRadius: 12 }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* Confirmation overlay */}
          {pendingStatus && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", borderRadius: 12 }}
            >
              <div
                className="p-6 max-w-sm w-full mx-4 shadow-2xl"
                style={{ background: "#1C1930", border: "0.5px solid rgba(139,130,190,0.12)", borderRadius: 10 }}
              >
                <p className="leading-relaxed mb-5" style={{ fontSize: 13, color: "#EAE8F2" }}>
                  Change{" "}
                  <span style={{ color: "#8B7FEE", fontWeight: 600 }}>{initialApp.applicant.name}</span>'s
                  status to{" "}
                  <span style={{ fontWeight: 600, color: "#EAE8F2" }}>{pendingStatus}</span>?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setPendingStatus(null)}
                    className="px-4 py-1.5 rounded-[8px] transition-colors"
                    style={{ fontSize: 12, border: "0.5px solid rgba(139,130,190,0.12)", color: "#A09BB5", background: "transparent" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmStatusChange}
                    disabled={changingStatus}
                    className="px-4 py-1.5 rounded-[8px] transition-colors disabled:opacity-50"
                    style={{ fontSize: 12, background: "#6B5FCC", color: "#EAE8F2" }}
                  >
                    {changingStatus ? "Saving..." : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-5 shrink-0"
            style={{ borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, #6B5FCC, #D4537E)" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "#EAE8F2" }}>
                  {getInitials(initialApp.applicant.name)}
                </span>
              </div>
              <div className="min-w-0">
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "#EAE8F2", lineHeight: 1.2 }}>
                  {initialApp.applicant.name}
                </h2>
                <p style={{ fontSize: 13, color: "#6A6580", lineHeight: 1.3 }}>{initialApp.applicant.email}</p>
              </div>
              <span
                className="shrink-0 px-2.5 py-1 rounded-full"
                style={{ fontSize: 11, fontWeight: 500, ...activeStatusColor }}
              >
                {activeApp.status}
              </span>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 ml-4 leading-none transition-colors"
              style={{ fontSize: 16, color: "#6A6580" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6A6580"; }}
            >
              ✕
            </button>
          </div>

          {/* Role / opportunity tabs */}
          <div
            className="flex gap-1 px-6 pt-3 pb-0 shrink-0"
            style={{ borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
          >
            {allApps.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveTab(a.id)}
                className="-mb-px px-3 py-1.5 transition-colors"
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: "6px 6px 0 0",
                  ...(activeTab === a.id
                    ? { background: "rgba(139,127,238,0.15)", color: "#8B7FEE" }
                    : { background: "transparent", color: "#A09BB5" }),
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== a.id) (e.currentTarget as HTMLButtonElement).style.background = "#1C1930";
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== a.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                {a.opportunity === boardOpportunity ? a.role : a.opportunity}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Q&A section — divider-separated, no card boxes */}
            {activeApp.rawData && Object.keys(activeApp.rawData).length > 0 ? (
              <div>
                {Object.entries(activeApp.rawData)
                  .filter(([key]) => !key.startsWith("_"))
                  .map(([question, answer], i, arr) => (
                    <div
                      key={question}
                      className="py-3"
                      style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(139,130,190,0.08)" } : {}}
                    >
                      <p className="mb-1 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                        {question}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed" style={{ fontSize: 13, color: "#EAE8F2" }}>
                        {String(answer) || "—"}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#6A6580", fontStyle: "italic" }}>No form responses recorded.</p>
            )}

            {/* Notes — tabbed */}
            <div>
              <div className="flex gap-1 mb-2.5">
                {visibleFields.map((field) => {
                  const tab = NOTE_TABS.find((t) => t.field === field)!;
                  const isActive = activeField === field;
                  return (
                    <button
                      key={field}
                      onClick={() => setActiveNotesTab(field)}
                      className="px-3 py-1 transition-colors"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 6,
                        ...(isActive
                          ? { background: "rgba(139,127,238,0.15)", color: "#8B7FEE" }
                          : { background: "transparent", color: "#A09BB5" }),
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#1C1930";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={noteDrafts[activeField]}
                onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [activeField]: e.target.value }))}
                onBlur={saveNotes}
                rows={4}
                placeholder={NOTE_TABS.find((t) => t.field === activeField)!.placeholder}
                className={`${modalInputCls} resize-none`}
                style={{ ...modalInputStyle, fontSize: 13, lineHeight: "1.6" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#6B5FCC"; }}
              />
              {savingNotes && (
                <p className="mt-1" style={{ fontSize: 11, color: "#6A6580" }}>Saving...</p>
              )}
              <p className="mt-1" style={{ fontSize: 10, color: "#6A6580", fontStyle: "italic" }}>
                Last edited by {modalSession?.user?.name ?? "Unknown"}
              </p>
            </div>

            {/* Change Status */}
            <div>
              <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                Change Status
              </p>
              <div className="flex gap-2 flex-wrap">
                {ACTION_STATUSES.filter((s) => s !== activeApp.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPendingStatus(s)}
                    style={statusButtonBase}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "#6B5FCC";
                      (e.currentTarget as HTMLButtonElement).style.color = "#EAE8F2";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,130,190,0.12)";
                      (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Email History */}
            {(() => {
              const rows: { label: string; sentAt: string | null }[] = [];
              const s = activeApp.status;
              if (s === "Interviewing" || s === "Accepted" || s === "Rejected") {
                rows.push({ label: "Interview invite", sentAt: activeApp.interview_invite_sent });
              }
              if (s === "Accepted") {
                rows.push({ label: "Acceptance email", sentAt: activeApp.acceptance_sent_at });
              }
              if (s === "Rejected") {
                rows.push({ label: "Rejection email", sentAt: activeApp.rejection_sent_at });
              }
              if (rows.length === 0) return null;
              return (
                <div>
                  <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                    Email History
                  </p>
                  <div className="space-y-2">
                    {rows.map(({ label, sentAt }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span style={{ fontSize: 12, color: sentAt ? "#4ADE80" : "#6A6580" }}>✉</span>
                        <span style={{ fontSize: 12, color: "#A09BB5" }}>{label}</span>
                        {sentAt ? (
                          <span className="ml-auto" style={{ fontSize: 12, color: "#4ADE80" }}>{formatDateTime(sentAt)}</span>
                        ) : (
                          <span className="ml-auto" style={{ fontSize: 12, color: "#6A6580" }}>not sent</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
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
  const emailSent = !!(EMAIL_STATUSES as readonly string[]).includes(app.status) && !!statusToSentAt(app.status, app);
  const showEmail = (EMAIL_STATUSES as readonly string[]).includes(app.status);

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.classList.remove("rcc-card-press");
    // Force reflow so removing + re-adding restarts animation
    void el.offsetWidth;
    el.classList.add("rcc-card-press");
    onOpen(app);
  }

  return (
    <div
      className="rounded-[8px] cursor-pointer select-none flex items-center gap-3"
      style={{
        background: "#1C1930",
        border: "0.5px solid rgba(139,130,190,0.12)",
        padding: "10px 12px",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#6B5FCC"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(139,130,190,0.12)"; }}
      onClick={handleCardClick}
    >
      {/* LEFT: initials avatar */}
      <div
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 32, height: 32, background: "#242040" }}
      >
        <span style={{ fontSize: 11, fontWeight: 500, color: "#8B7FEE" }}>
          {getInitials(app.applicant.name)}
        </span>
      </div>

      {/* MIDDLE: name + role + optional team pref */}
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: "#EAE8F2", lineHeight: "1.3" }}>
          {app.applicant.name}
        </p>
        <p className="truncate" style={{ fontSize: 10, color: "#6A6580", lineHeight: "1.3" }}>
          {app.role}
        </p>
        {app.track === "Ambassador" && app.rawData?._teamPreference1 && (
          <p className="truncate" style={{ fontSize: 9, color: "#8B7FEE", opacity: 0.7, lineHeight: "1.3" }}>
            Prefers: {app.rawData._teamPreference1}
          </p>
        )}
      </div>

      {/* RIGHT: email status badge */}
      {showEmail && (
        <span
          className="shrink-0"
          style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: "1.4",
            background: emailSent ? "rgba(74,222,128,0.12)" : "rgba(106,101,128,0.2)",
            color: emailSent ? "#4ADE80" : "#6A6580",
            whiteSpace: "nowrap",
          }}
        >
          ✉ {emailSent ? "Sent" : "Not sent"}
        </span>
      )}
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
  const barColor = columnBarColor(status);
  return (
    <div className="flex flex-col min-w-0 overflow-hidden">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        {/* Colored bar */}
        <div style={{ width: 3, height: 14, borderRadius: 2, background: barColor, flexShrink: 0 }} />
        <h3
          className="flex-1 uppercase"
          style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.6px", color: "#A09BB5" }}
        >
          {status}
        </h3>
        <span
          style={{
            fontSize: 10,
            background: "#1C1930",
            color: "#6A6580",
            padding: "2px 8px",
            borderRadius: 10,
          }}
        >
          {apps.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {apps.map((app) => (
          <ApplicantCard key={app.id} app={app} onOpen={onOpen} />
        ))}
        {apps.length === 0 && (
          <p
            className="text-center py-8 rounded-lg"
            style={{ fontSize: 11, color: "#6A6580", border: "0.5px dashed rgba(139,130,190,0.15)" }}
          >
            No applicants
          </p>
        )}
      </div>
    </div>
  );
}

// ── Pill style for command strip controls ─────────────────────────────────────
const stripPillStyle: React.CSSProperties = {
  background: "#1C1930",
  border: "0.5px solid rgba(139,130,190,0.12)",
  color: "#A09BB5",
  borderRadius: "6px",
  fontSize: "12px",
  padding: "6px 10px",
  outline: "none",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [opportunities, setOpportunities] = useState<string[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<string>("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [selectedTeam, setSelectedTeam] = useState("All Teams");
  const [renamingOpportunity, setRenamingOpportunity] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);

  const { data: session } = useSession();
  const sessionName = session?.user?.name ?? "User";
  const sessionInitials = getInitials(sessionName);
  const isAdmin = session?.user?.role === "admin";

  // Import opportunity state (lifted from ImportButton)
  const importOpportunity = useImportOpportunity();

  const fetchOpportunities = useCallback((autoSelect = false) => {
    fetch("/api/applications?opportunities=true")
      .then((r) => r.json())
      .catch(() => [])
      .then((data: string[]) => {
        setOpportunities(data);
        if (autoSelect && data.length > 0) setSelectedOpportunity(data[0]);
      });
  }, []);

  useEffect(() => {
    fetchOpportunities(true);
  }, [fetchOpportunities]);

  const fetchApps = useCallback(() => {
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

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const isAmbassadorBoard = applications.some((a) => a.track === "Ambassador");

  useEffect(() => {
    if (!isAmbassadorBoard) setSelectedTeam("All Teams");
  }, [isAmbassadorBoard]);

  const handleImportSuccess = useCallback(() => {
    fetchOpportunities(!selectedOpportunity);
    fetchApps();
  }, [fetchOpportunities, fetchApps, selectedOpportunity]);

  const handleStatusChange = useCallback((id: string, newStatus: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
  }, []);

  async function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    if (trimmed === selectedOpportunity) {
      setRenamingOpportunity(false);
      setRenameError(null);
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    try {
      const res = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: selectedOpportunity, newName: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.error ?? "Failed to rename.");
        return;
      }
      fetch("/api/applications?opportunities=true")
        .then((r) => r.json())
        .catch(() => [])
        .then((updated: string[]) => {
          setOpportunities(updated);
          setSelectedOpportunity(trimmed);
          setRenamingOpportunity(false);
        });
    } catch (e) {
      setRenameError((e as Error).message);
    } finally {
      setRenameLoading(false);
    }
  }

  const filtered = applications.filter((a) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.applicant.name.toLowerCase().includes(q) && !a.applicant.email.toLowerCase().includes(q)) return false;
    }
    if (isAmbassadorBoard && selectedTeam !== "All Teams") {
      const prefs = [a.rawData?._teamPreference1, a.rawData?._teamPreference2, a.rawData?._teamPreference3];
      if (!prefs.some((p) => p === selectedTeam)) return false;
    }
    return true;
  });

  const byStatus = (status: Status) => filtered.filter((a) => a.status === status);

  return (
    <main
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: "#0C0A14" }}
    >
      {/* ── ZONE 1: Header Bar (~48px) ─────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          height: "48px",
          background: "#141120",
          borderBottom: "0.5px solid rgba(139,130,190,0.12)",
        }}
      >
        {/* Left: logo + app name */}
        <div className="flex items-center gap-2.5">
          {/* Logo mark */}
          <div
            className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #6B5FCC, #D4537E)" }}
          >
            <span className="text-sm font-bold" style={{ color: "#EAE8F2" }}>R</span>
          </div>
          {/* App identity */}
          <div className="leading-none">
            <p className="text-[15px] font-semibold leading-tight" style={{ color: "#EAE8F2" }}>RCC ATS</p>
            <p className="text-[11px] leading-tight" style={{ color: "#6A6580" }}>Applicant tracking system</p>
          </div>
        </div>

        {/* Right: user identity + sign out */}
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "#6A6580" }}>{sessionName}</span>
          {session?.user?.image ? (
            <img
              src={session.user.image}
              alt={sessionName}
              referrerPolicy="no-referrer"
              className="w-[30px] h-[30px] rounded-full shrink-0 object-cover"
            />
          ) : (
            <div
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #6B5FCC, #D4537E)" }}
            >
              <span className="text-[11px] font-semibold" style={{ color: "#EAE8F2" }}>{sessionInitials}</span>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-[11px] transition-colors"
            style={{ color: "#6A6580", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6A6580"; }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── ZONE 2: Command Strip (~44px) — relative so banners can anchor to it */}
      <div
        className="flex items-center gap-2 px-5 shrink-0 relative"
        style={{
          height: "44px",
          background: "#141120",
          borderBottom: "0.5px solid rgba(139,130,190,0.12)",
        }}
      >
        {/* 1. Board opportunity dropdown / inline rename */}
        {opportunities.length === 0 ? (
          <span style={{ ...stripPillStyle, color: "#6A6580", cursor: "default" }}>
            No opportunities
          </span>
        ) : renamingOpportunity ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") { setRenamingOpportunity(false); setRenameError(null); }
              }}
              className="transition-colors"
              style={{ ...stripPillStyle, width: 160 }}
            />
            <button
              onClick={handleRenameSubmit}
              disabled={renameLoading}
              className="transition-colors disabled:opacity-50"
              style={{ background: "#6B5FCC", color: "#EAE8F2", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
            >
              {renameLoading ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setRenamingOpportunity(false); setRenameError(null); }}
              style={{ background: "transparent", border: "none", color: "#A09BB5", fontSize: 12, cursor: "pointer", padding: "5px 6px" }}
            >
              ✕
            </button>
            {renameError && (
              <span
                className="absolute pointer-events-none"
                style={{ top: "calc(100% + 2px)", left: 20, fontSize: 11, color: "#F06060", whiteSpace: "nowrap" }}
              >
                {renameError}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              value={selectedOpportunity}
              onChange={(e) => setSelectedOpportunity(e.target.value)}
              className="appearance-none cursor-pointer transition-colors"
              style={{ ...stripPillStyle, maxWidth: "160px" }}
            >
              {opportunities.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {selectedOpportunity && (
              <button
                onClick={() => { setRenameValue(selectedOpportunity); setRenamingOpportunity(true); setRenameError(null); }}
                title="Rename opportunity"
                style={{ background: "transparent", border: "none", color: "#6A6580", cursor: "pointer", padding: "4px", lineHeight: 1, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6A6580"; }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 2. Ambassador team filter (only when ambassador board) */}
        {isAmbassadorBoard && (
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="appearance-none cursor-pointer transition-colors"
            style={stripPillStyle}
          >
            <option value="All Teams">All Teams</option>
            {AMBASSADOR_TEAMS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {/* 3. Divider */}
        <div style={{ width: "1px", height: "20px", background: "rgba(139,130,190,0.12)", flexShrink: 0 }} />

        {/* 4. Search box */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="transition-colors"
          style={{
            ...stripPillStyle,
            flex: "1",
            maxWidth: "280px",
            color: search ? "#EAE8F2" : "#6A6580",
          }}
        />

        {/* 5. Spacer */}
        <div style={{ flex: 1 }} />

        {/* Manage Access — admin only */}
        {isAdmin && (
          <button
            onClick={() => setShowAccessModal(true)}
            className="transition-colors"
            style={{
              ...stripPillStyle,
              cursor: "pointer",
              border: "0.5px solid rgba(139,130,190,0.12)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#EAE8F2"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
          >
            Manage Access
          </button>
        )}

        {/* Import — admin only */}
        {isAdmin && (
          <ImportButton
            selectedOpportunity={importOpportunity.selectedOpportunity}
            onImportSuccess={handleImportSuccess}
            importOpportunity={importOpportunity}
          />
        )}
      </div>

      {/* ── ZONE 3: Board Area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        {loadingApps ? (
          <p className="text-sm" style={{ color: "#6A6580" }}>Loading...</p>
        ) : (
          <div className="grid grid-cols-4 gap-4 h-full">
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

      {/* Full-page applicant modal */}
      {selectedApp && (
        <ApplicantModal
          initialApp={selectedApp}
          onClose={() => setSelectedApp(null)}
          onStatusChange={handleStatusChange}
          onRefreshBoard={fetchApps}
          boardOpportunity={selectedOpportunity}
        />
      )}

      {/* Manage Access modal — admin only */}
      {isAdmin && showAccessModal && (
        <ManageAccessModal onClose={() => setShowAccessModal(false)} />
      )}
    </main>
  );
}
