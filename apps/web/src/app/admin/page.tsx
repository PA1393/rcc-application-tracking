"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import ImportButton, {
  useImportOpportunity,
} from "@/components/importButton";
import { getEmailTemplate } from "@/lib/emailTemplates";
import ManageAccessModal from "@/components/ManageAccessModal";
import { handleAuthFailure } from "@/lib/utils";
import { MAX_INTERVIEW_ROLES } from "@/lib/interviewRoles";
import { DELETE_APPLICATION_PHRASE, matchesDeletePhrase } from "@/lib/deleteConfirmation";

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
  interview_roles: string[];
  rawData: Record<string, string> | null;
  applicant: { name: string; email: string };
};

const STATUSES = ["To Review", "Interviewing", "Rejected", "Accepted"] as const;
type Status = (typeof STATUSES)[number];

// How often to silently refetch the board so reviewers see each other's changes.
// Bandwidth math (5 reviewers, 100-row opportunity, ~150 KB gzip/fetch) sits well
// under Vercel Hobby limits at 15s; DB query volume and connection pool headroom
// are the reason to stay at 15s rather than 10s.
const POLL_INTERVAL_MS = 15_000;

type ToastTone = "success" | "error" | "info";
type Toast = { message: string; tone: ToastTone };

const TOAST_TONE_STYLE: Record<ToastTone, React.CSSProperties> = {
  success: {
    background: "rgba(74,222,128,0.12)",
    color: "#4ADE80",
    border: "0.5px solid rgba(74,222,128,0.25)",
  },
  error: {
    background: "rgba(240,96,96,0.12)",
    color: "#F06060",
    border: "0.5px solid rgba(240,96,96,0.25)",
  },
  info: {
    background: "rgba(167,139,250,0.12)",
    color: "#c4b5fd",
    border: "0.5px solid rgba(167,139,250,0.25)",
  },
};

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
    case "To Review":    return { background: "rgba(79,140,255,0.14)",   color: "#4f8cff" };
    case "Interviewing": return { background: "rgba(167,139,250,0.16)",  color: "#a78bfa" };
    case "Accepted":     return { background: "rgba(52,211,153,0.14)",   color: "#34d399" };
    case "Rejected":     return { background: "rgba(244,63,94,0.14)",    color: "#f43f5e" };
    default:             return { background: "rgba(155,153,171,0.14)",  color: "#9a98ab" };
  }
}

function columnBarColor(status: Status): string {
  switch (status) {
    case "To Review":    return "#4f8cff";
    case "Interviewing": return "#a78bfa";
    case "Accepted":     return "#34d399";
    case "Rejected":     return "#f43f5e";
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

// ── Preference helpers ────────────────────────────────────────────────────────

function getRankedPreferences(
  rawData: Record<string, any> | null | undefined
): Array<{ rank: 1 | 2 | 3; role: string }> {
  if (!rawData) return [];
  const result: Array<{ rank: 1 | 2 | 3; role: string }> = [];
  const p1 = rawData._teamPreference1;
  const p2 = rawData._teamPreference2;
  const p3 = rawData._teamPreference3;
  if (typeof p1 === "string" && p1.trim()) result.push({ rank: 1, role: p1.trim() });
  if (typeof p2 === "string" && p2.trim()) result.push({ rank: 2, role: p2.trim() });
  if (typeof p3 === "string" && p3.trim()) result.push({ rank: 3, role: p3.trim() });
  return result;
}

const RANK_LABELS: Record<1 | 2 | 3, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

// ── Modal Q&A display helpers ─────────────────────────────────────────────────

// Column prefix for the new Lead & Ambassador matrix form.
// Raw bracketed position columns are suppressed in the Q&A display and replaced
// with clean "1st / 2nd / 3rd Preference" rows from the stored helper keys.
const MATRIX_POSITION_PREFIX = "Select the Position You're Applying For [";

// Returns true if a Q&A value should be treated as unanswered and hidden.
// Hides: empty strings, whitespace-only, null/undefined, and dash placeholders.
// Does NOT hide "0", numeric strings, URLs, or other real short values.
function isUnanswered(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return s === "" || s === "—" || s === "-";
}

// Builds the ordered display entries for the modal Q&A section.
// Matrix ambassador rows: suppresses bracketed position columns and injects
//   clean "1st/2nd/3rd Preference" rows from the _teamPreference helper keys.
// All rows: hides unanswered entries.
function buildQaEntries(rawData: Record<string, string>): [string, string][] {
  const isMatrix = Object.keys(rawData).some((k) => k.startsWith(MATRIX_POSITION_PREFIX));

  const prefEntries: [string, string][] = isMatrix
    ? (
        [
          ["1st Preference", rawData._teamPreference1 ?? ""],
          ["2nd Preference", rawData._teamPreference2 ?? ""],
          ["3rd Preference", rawData._teamPreference3 ?? ""],
        ] as [string, string][]
      ).filter(([, v]) => !isUnanswered(v))
    : [];

  const mainEntries = (Object.entries(rawData) as [string, string][]).filter(
    ([key, val]) =>
      !key.startsWith("_") &&
      !(isMatrix && key.startsWith(MATRIX_POSITION_PREFIX)) &&
      !isUnanswered(val)
  );

  return [...prefEntries, ...mainEntries];
}

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
  onDefer,
  isManual,
}: {
  app: Application;
  status: string;
  onSent: (wasSent: boolean) => void;
  canCancel: boolean;
  onCancel: () => Promise<void>;
  onDefer: () => void;
  isManual?: boolean;
}) {
  const template = getEmailTemplate(status, {
    name: app.applicant.name,
    role: app.role,
    opportunity: app.opportunity,
    roles: app.interview_roles,
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
      if (handleAuthFailure(res)) return;
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
          {!isManual && !alreadySentAt && (
            <button
              onClick={onDefer}
              disabled={sending || canceling}
              className="flex-1 text-sm font-medium py-2.5 rounded-[8px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "rgba(139,127,238,0.12)", color: "#8B7FEE", border: "0.5px solid rgba(139,127,238,0.25)" }}
            >
              Send Email Later
            </button>
          )}
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

// ── Interview role picker (shared) ────────────────────────────────────────────
// Rendered both inside the applicant modal's status-change overlay and inside
// the page-level DropRolePickerModal (below), so a drag into Interviewing
// surfaces the same picker with the same constraints as the modal path.
function InterviewRolePicker({
  options,
  selected,
  onChange,
}: {
  options: Array<{ rank: 1 | 2 | 3; role: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((p) => {
        const picked = selected.includes(p.role);
        const atLimit = selected.length >= MAX_INTERVIEW_ROLES;
        const disabled = !picked && atLimit;
        return (
          <button
            key={p.rank}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(
                selected.includes(p.role)
                  ? selected.filter((r) => r !== p.role)
                  : [...selected, p.role]
              )
            }
            className="transition-colors disabled:cursor-not-allowed"
            style={{
              fontSize: 11,
              padding: "5px 10px",
              borderRadius: 999,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.35 : 1,
              background: picked ? "rgba(167,139,250,0.16)" : "transparent",
              border: picked
                ? "0.5px solid rgba(167,139,250,0.45)"
                : "0.5px solid rgba(139,130,190,0.12)",
              color: picked ? "#a78bfa" : "#A09BB5",
            }}
          >
            {RANK_LABELS[p.rank]}: {p.role}
          </button>
        );
      })}
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
  onDeleted,
  onRefreshBoard,
  onToast,
  boardOpportunity,
}: {
  initialApp: Application;
  onClose: () => void;
  onStatusChange: (id: string, status: string, interviewRoles?: string[]) => void;
  onDeleted: (id: string) => void;
  onRefreshBoard: () => void;
  onToast: (message: string, tone: ToastTone) => void;
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
  const [selectedInterviewRoles, setSelectedInterviewRoles] = useState<string[]>([]);
  const [changingStatus, setChangingStatus] = useState(false);
  const [emailDraftStatus, setEmailDraftStatus] = useState<string | null>(null);
  const [previousEmailStatus, setPreviousEmailStatus] = useState<string | null>(null);
  const [emailIsManual, setEmailIsManual] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPanelWidth, setNotesPanelWidth] = useState(NOTES_DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  // In-place edit of interview_roles from the "Interviewing for" chip row.
  // Draft mirrors the row's current roles until Save; Save is blocked when the
  // draft is empty because the chip row (and this Edit affordance) is gated on
  // interview_roles.length > 0.
  const [editingRoles, setEditingRoles] = useState(false);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!notesOpen) setNotesPanelWidth(NOTES_DEFAULT_WIDTH);
  }, [notesOpen]);

  // Drag listeners — registered only while dragging; effect cleanup handles unmount-mid-drag.
  useEffect(() => {
    if (!isDragging) return;
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const { startX, startWidth } = dragRef.current;
      // Left-edge handle on a right-side panel: drag left → wider (startX - clientX > 0)
      const next = Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, startWidth + (startX - e.clientX)));
      setNotesPanelWidth(next);
    }
    function onUp() { setIsDragging(false); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
      .then((r) => {
        if (handleAuthFailure(r)) return null;
        return r.ok ? r.json() : [];
      })
      .catch(() => [])
      .then((data: unknown) => {
        if (data === null) return;
        setAllApps(Array.isArray(data) ? (data as Application[]) : []);
      });
  }, [initialApp.applicant_id]);

  useEffect(() => {
    const app = allApps.find((a) => a.id === activeTab) ?? initialApp;
    setActiveNotesTab("application_notes");
    setNoteDrafts({
      application_notes: app.application_notes ?? "",
      interview_notes:   app.interview_notes   ?? "",
      decision_notes:    app.decision_notes    ?? "",
    });
    // A draft roles-edit must not carry across to a different application.
    setEditingRoles(false);
    setRoleDraft([]);
  }, [activeTab, allApps]);

  // A typed confirmation phrase must never carry across to a different application.
  useEffect(() => {
    setDeleteOpen(false);
    setDeletePhrase("");
    setDeleteError(null);
  }, [activeTab]);

  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (emailDraftStatus) return;
        if (pendingStatus) {
          setPendingStatus(null);
        } else if (editingRoles) {
          if (savingRoles) return;
          setEditingRoles(false);
          setRoleDraft([]);
        } else if (deleteOpen) {
          if (deleting) return;
          setDeleteOpen(false);
          setDeletePhrase("");
          setDeleteError(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pendingStatus, emailDraftStatus, deleteOpen, deleting, editingRoles, savingRoles]);

  const activeApp = allApps.find((a) => a.id === activeTab) ?? initialApp;
  // E-Board rows also carry track "Ambassador" but have no ranked preference keys,
  // so the preference list is what actually identifies the matrix cohort.
  const interviewRoleOptions = getRankedPreferences(activeApp.rawData);
  const canPickInterviewRoles = activeApp.track === "Ambassador" && interviewRoleOptions.length > 0;
  const visibleFields = visibleNoteFields(activeApp);
  // Mirrors the server's 409 guard: a Placement keys on applicant+track+season and
  // holds no reference back to the application, so deleting an accepted one would
  // orphan it. The UI blocks it early; the server still rejects it either way.
  const deleteBlocked = activeApp.status === "Accepted";
  const canConfirmDelete = !deleteBlocked && !deleting && matchesDeletePhrase(deletePhrase);
  const activeField: NoteField = visibleFields.includes(activeNotesTab) ? activeNotesTab : "application_notes";

  async function saveNotes() {
    setSavingNotes(true);
    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, [activeField]: noteDrafts[activeField] }),
    });
    setSavingNotes(false);
    if (handleAuthFailure(res)) return;
    if (!res.ok) {
      onToast("Failed to save notes. Please try again.", "error");
    }
  }

  async function saveRoles() {
    if (roleDraft.length === 0) return;
    setSavingRoles(true);
    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeApp.id, interview_roles: roleDraft }),
      });
      if (handleAuthFailure(res)) return;
      if (!res.ok) {
        onToast("Failed to update interview roles. Please try again.", "error");
        return;
      }
      const savedId = activeApp.id;
      const savedRoles = roleDraft;
      setAllApps((prev) =>
        prev.map((a) => (a.id === savedId ? { ...a, interview_roles: savedRoles } : a))
      );
      onStatusChange(savedId, activeApp.status, savedRoles);
      setEditingRoles(false);
      setRoleDraft([]);
    } catch {
      onToast("Failed to update interview roles. Please try again.", "error");
    } finally {
      setSavingRoles(false);
    }
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setChangingStatus(true);

    const previousStatus = activeApp.status;
    const sendingRoles = pendingStatus === "Interviewing" && canPickInterviewRoles;

    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeApp.id,
        status: pendingStatus,
        ...(sendingRoles && { interview_roles: selectedInterviewRoles }),
      }),
    });

    if (handleAuthFailure(res)) {
      setChangingStatus(false);
      setPendingStatus(null);
      return;
    }

    if (!res.ok) {
      setChangingStatus(false);
      setPendingStatus(null);
      onToast("Failed to update status. Please try again.", "error");
      return;
    }

    const confirmedStatus = pendingStatus;
    const confirmedRoles = selectedInterviewRoles;

    setAllApps((prev) =>
      prev.map((a) =>
        a.id === activeApp.id
          ? { ...a, status: confirmedStatus, ...(sendingRoles && { interview_roles: confirmedRoles }) }
          : a
      )
    );
    onStatusChange(activeApp.id, confirmedStatus, sendingRoles ? confirmedRoles : undefined);
    setPendingStatus(null);
    setChangingStatus(false);

    if ((EMAIL_STATUSES as readonly string[]).includes(confirmedStatus)) {
      setPreviousEmailStatus(previousStatus);
      setEmailDraftStatus(confirmedStatus);
    }
  }

  async function handleEmailCancel() {
    if (emailIsManual) {
      setEmailDraftStatus(null);
      setEmailIsManual(false);
      return;
    }
    if (!previousEmailStatus) return;
    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeApp.id, status: previousEmailStatus }),
    });
    if (handleAuthFailure(res)) return;
    if (!res.ok) {
      onToast("Failed to revert status. Please try again.", "error");
      return;
    }
    const reverted = previousEmailStatus;
    setAllApps((prev) =>
      prev.map((a) => (a.id === activeApp.id ? { ...a, status: reverted } : a))
    );
    onStatusChange(activeApp.id, reverted);
    setEmailDraftStatus(null);
    setPreviousEmailStatus(null);
  }

  async function handleDelete() {
    if (!canConfirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeApp.id, confirmation: deletePhrase }),
      });
      if (handleAuthFailure(res)) return;
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Failed to delete application.");
        return;
      }
      const deletedId = activeApp.id;
      const remaining = allApps.filter((a) => a.id !== deletedId);
      onDeleted(deletedId);
      if (remaining.length === 0) {
        onClose();
        return;
      }
      // Keep the modal open on the applicant's next remaining application.
      setAllApps(remaining);
      setActiveTab(remaining[0].id);
      setDeleteOpen(false);
      setDeletePhrase("");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const activeStatusColor = statusColor(activeApp.status);

  return (
    <>
      {emailDraftStatus && (
        <EmailDraftModal
          app={activeApp}
          status={emailDraftStatus}
          canCancel={emailIsManual || emailDraftStatus !== "Accepted"}
          onCancel={handleEmailCancel}
          onDefer={() => {
            setEmailDraftStatus(null);
            setPreviousEmailStatus(null);
            setEmailIsManual(false);
            onRefreshBoard();
            fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
              .then((r) => {
                if (handleAuthFailure(r)) return null;
                return r.ok ? r.json() : [];
              })
              .catch(() => [])
              .then((data: unknown) => {
                if (data === null) return;
                setAllApps(Array.isArray(data) ? (data as Application[]) : []);
              });
          }}
          isManual={emailIsManual}
          onSent={(wasSent) => {
            setEmailDraftStatus(null);
            setEmailIsManual(false);
            if (wasSent) setToastVisible(true);
            onRefreshBoard();
            fetch(`/api/applications?applicantId=${initialApp.applicant_id}`)
              .then((r) => {
                if (handleAuthFailure(r)) return null;
                return r.ok ? r.json() : [];
              })
              .catch(() => [])
              .then((data: unknown) => {
                if (data === null) return;
                setAllApps(Array.isArray(data) ? (data as Application[]) : []);
              });
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
        {/* Modal panel — widens when notes drawer is open */}
        <div
          className="rcc-modal-panel relative w-full max-h-[90vh] flex flex-col shadow-2xl"
          style={{
            maxWidth: notesOpen ? "72rem" : "48rem",
            transition: "max-width 0.26s cubic-bezier(0.16, 1, 0.3, 1)",
            background: "#141120",
            border: "0.5px solid rgba(139,130,190,0.12)",
            borderRadius: 12,
          }}
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

                {pendingStatus === "Interviewing" && canPickInterviewRoles && (
                  <div className="mb-5">
                    <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                      Roles being considered <span style={{ textTransform: "none" }}>(up to 3)</span>
                    </p>
                    <InterviewRolePicker
                      options={interviewRoleOptions}
                      selected={selectedInterviewRoles}
                      onChange={setSelectedInterviewRoles}
                    />
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setSelectedInterviewRoles([]);
                      setPendingStatus(null);
                    }}
                    className="px-4 py-1.5 rounded-[8px] transition-colors"
                    style={{ fontSize: 12, border: "0.5px solid rgba(139,130,190,0.12)", color: "#A09BB5", background: "transparent" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmStatusChange}
                    disabled={
                      changingStatus ||
                      (pendingStatus === "Interviewing" &&
                        canPickInterviewRoles &&
                        selectedInterviewRoles.length === 0)
                    }
                    title={
                      pendingStatus === "Interviewing" &&
                      canPickInterviewRoles &&
                      selectedInterviewRoles.length === 0
                        ? "Select at least one role"
                        : undefined
                    }
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
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {/* Notes toggle */}
              <button
                onClick={() => setNotesOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] transition-all"
                title={notesOpen ? "Close notes" : "Open notes"}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.3px",
                  background: notesOpen ? "rgba(139,127,238,0.18)" : "transparent",
                  border: `0.5px solid ${notesOpen ? "rgba(139,127,238,0.4)" : "rgba(139,130,190,0.18)"}`,
                  color: notesOpen ? "#8B7FEE" : "#6A6580",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!notesOpen) {
                    (e.currentTarget as HTMLButtonElement).style.background = "#1C1930";
                    (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!notesOpen) {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = "#6A6580";
                  }
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 9.5V11h1.5l5-5L6 4.5l-5 5ZM10.7 2.3a1 1 0 0 0 0-1.4L9.1.3a1 1 0 0 0-1.4 0L6.5 1.5 9 4l1.7-1.7Z" fill="currentColor"/>
                </svg>
                Notes
              </button>
              {/* Close */}
              <button
                onClick={onClose}
                className="leading-none transition-colors"
                style={{ fontSize: 16, color: "#6A6580" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6A6580"; }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Preference chip row — Ambassador matrix applications only */}
          {activeApp.track === "Ambassador" && getRankedPreferences(activeApp.rawData).length > 0 && (
            <div
              className="flex items-center gap-2 px-6 shrink-0 flex-wrap"
              style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
            >
              <span style={{ fontSize: 11, fontWeight: 500, color: "#6A6580", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
                Preferences
              </span>
              {getRankedPreferences(activeApp.rawData).map((p) => (
                <span
                  key={p.rank}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#8B7FEE",
                    background: "rgba(139,127,238,0.15)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {RANK_LABELS[p.rank]}: {p.role}
                </span>
              ))}
            </div>
          )}

          {/* Roles chosen at the Interviewing step.
              Gated on canPickInterviewRoles (not roles.length) so the Edit
              pencil stays reachable for any Ambassador-with-prefs applicant
              that landed in Interviewing before B1 was shipped. */}
          {activeApp.status === "Interviewing" && canPickInterviewRoles && (
            <div
              className="flex items-center gap-2 px-6 shrink-0 flex-wrap"
              style={{ paddingTop: 10, paddingBottom: 10, borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
            >
              <span style={{ fontSize: 11, fontWeight: 500, color: "#6A6580", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
                Interviewing for
              </span>
              {!editingRoles && activeApp.interview_roles.length === 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#6A6580",
                    fontStyle: "italic",
                    whiteSpace: "nowrap",
                  }}
                >
                  No roles selected yet
                </span>
              )}
              {!editingRoles && activeApp.interview_roles.map((role) => (
                <span
                  key={role}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#a78bfa",
                    background: "rgba(167,139,250,0.16)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {role}
                </span>
              ))}

              {!editingRoles && canPickInterviewRoles && (
                <button
                  type="button"
                  onClick={() => {
                    setRoleDraft(activeApp.interview_roles);
                    setEditingRoles(true);
                  }}
                  title="Edit interview roles"
                  className="transition-colors"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#A09BB5",
                    background: "transparent",
                    border: "0.5px solid rgba(139,130,190,0.18)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    cursor: "pointer",
                    marginLeft: 4,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#6B5FCC";
                    (e.currentTarget as HTMLButtonElement).style.color = "#EAE8F2";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,130,190,0.18)";
                    (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
                  }}
                >
                  Edit
                </button>
              )}

              {editingRoles && (
                <>
                  <div className="w-full" style={{ marginTop: 4 }}>
                    <InterviewRolePicker
                      options={interviewRoleOptions}
                      selected={roleDraft}
                      onChange={setRoleDraft}
                    />
                  </div>
                  <div className="w-full flex gap-2 justify-end" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (savingRoles) return;
                        setEditingRoles(false);
                        setRoleDraft([]);
                      }}
                      disabled={savingRoles}
                      className="transition-colors disabled:opacity-50"
                      style={{
                        fontSize: 11,
                        color: "#A09BB5",
                        background: "transparent",
                        border: "0.5px solid rgba(139,130,190,0.18)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        cursor: savingRoles ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveRoles}
                      disabled={savingRoles || roleDraft.length === 0}
                      title={roleDraft.length === 0 ? "Select at least one role" : undefined}
                      className="transition-colors disabled:opacity-50"
                      style={{
                        fontSize: 11,
                        color: "#EAE8F2",
                        background: "#6B5FCC",
                        border: "0.5px solid rgba(167,139,250,0.35)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        cursor: savingRoles || roleDraft.length === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      {savingRoles ? "Saving..." : "Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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

          {/* Body — two-column when notes are open */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* LEFT: Scrollable application content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">

              {/* Q&A section — divider-separated, no card boxes */}
              {(() => {
                const qaEntries = activeApp.rawData ? buildQaEntries(activeApp.rawData) : [];
                if (qaEntries.length === 0) {
                  return <p style={{ fontSize: 13, color: "#6A6580", fontStyle: "italic" }}>No form responses recorded.</p>;
                }
                return (
                  <div>
                    {qaEntries.map(([question, answer], i, arr) => (
                      <div
                        key={question}
                        className="py-3"
                        style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(139,130,190,0.08)" } : {}}
                      >
                        <p className="mb-1 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                          {question}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed" style={{ fontSize: 13, color: "#EAE8F2" }}>
                          {String(answer)}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Notes — tabbed (shown at bottom only when side panel is closed) */}
              {!notesOpen && (
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
              )}

              {/* Change Status */}
              <div>
                <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                  Change Status
                </p>
                <div className="flex gap-2 flex-wrap">
                  {ACTION_STATUSES.filter((s) => s !== activeApp.status).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSelectedInterviewRoles([]);
                        setPendingStatus(s);
                      }}
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
                const rows: { label: string; sentAt: string | null; emailStatus: string }[] = [];
                const s = activeApp.status;
                if (s === "Interviewing" || s === "Accepted" || s === "Rejected") {
                  rows.push({ label: "Interview invite", sentAt: activeApp.interview_invite_sent, emailStatus: "Interviewing" });
                }
                if (s === "Accepted") {
                  rows.push({ label: "Acceptance email", sentAt: activeApp.acceptance_sent_at, emailStatus: "Accepted" });
                }
                if (s === "Rejected") {
                  rows.push({ label: "Rejection email", sentAt: activeApp.rejection_sent_at, emailStatus: "Rejected" });
                }
                if (rows.length === 0) return null;
                return (
                  <div>
                    <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
                      Email History
                    </p>
                    <div className="space-y-2">
                      {rows.map(({ label, sentAt, emailStatus }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span style={{ fontSize: 12, color: sentAt ? "#4ADE80" : "#6A6580" }}>✉</span>
                          <span style={{ fontSize: 12, color: "#A09BB5" }}>{label}</span>
                          {sentAt ? (
                            <span className="ml-auto" style={{ fontSize: 12, color: "#4ADE80" }}>{formatDateTime(sentAt)}</span>
                          ) : (
                            <div className="ml-auto flex items-center gap-2">
                              <span style={{ fontSize: 12, color: "#6A6580" }}>not sent</span>
                              {emailStatus === s && (
                                <button
                                  onClick={() => {
                                    setEmailIsManual(true);
                                    setEmailDraftStatus(emailStatus);
                                  }}
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    background: "rgba(139,127,238,0.12)",
                                    color: "#8B7FEE",
                                    border: "0.5px solid rgba(139,127,238,0.25)",
                                    cursor: "pointer",
                                  }}
                                >
                                  Send now
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Danger Zone */}
              <div
                style={{
                  borderTop: "0.5px solid rgba(240,96,96,0.16)",
                  paddingTop: 16,
                  marginTop: 4,
                }}
              >
                <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#F06060" }}>
                  Danger Zone
                </p>

                {!deleteOpen ? (
                  <>
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setDeletePhrase("");
                        setDeleteOpen(true);
                      }}
                      disabled={deleteBlocked}
                      style={{
                        ...statusButtonBase,
                        color: deleteBlocked ? "#6A6580" : "#F06060",
                        borderColor: deleteBlocked
                          ? "rgba(139,130,190,0.12)"
                          : "rgba(240,96,96,0.28)",
                        cursor: deleteBlocked ? "not-allowed" : "pointer",
                        opacity: deleteBlocked ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (deleteBlocked) return;
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(240,96,96,0.10)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(240,96,96,0.5)";
                      }}
                      onMouseLeave={(e) => {
                        if (deleteBlocked) return;
                        (e.currentTarget as HTMLButtonElement).style.background = "#1C1930";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(240,96,96,0.28)";
                      }}
                    >
                      Delete application
                    </button>
                    <p className="mt-2" style={{ fontSize: 11, color: "#6A6580", lineHeight: 1.5 }}>
                      {deleteBlocked
                        ? "Accepted applications cannot be deleted because a placement record may depend on them."
                        : "Permanently deletes this one application. The applicant and their other applications are not affected."}
                    </p>
                  </>
                ) : (
                  <div
                    style={{
                      background: "rgba(240,96,96,0.05)",
                      border: "0.5px solid rgba(240,96,96,0.22)",
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <p style={{ fontSize: 12.5, color: "#EAE8F2", lineHeight: 1.6 }}>
                      Delete <strong>{activeApp.applicant.name}</strong>&rsquo;s application for{" "}
                      <strong>{activeApp.role}</strong>?
                    </p>
                    <p className="mt-1" style={{ fontSize: 11, color: "#A09BB5", lineHeight: 1.5 }}>
                      This cannot be undone. Notes, interview roles, and email history for this
                      application are removed with it.
                    </p>

                    <p className="mt-3 mb-1.5" style={{ fontSize: 11, color: "#A09BB5" }}>
                      Type <span style={{ color: "#F06060" }}>{DELETE_APPLICATION_PHRASE}</span> to confirm
                    </p>
                    <input
                      type="text"
                      value={deletePhrase}
                      onChange={(e) => setDeletePhrase(e.target.value)}
                      placeholder={DELETE_APPLICATION_PHRASE}
                      autoFocus
                      disabled={deleting}
                      className={modalInputCls}
                      style={{ ...modalInputStyle, fontSize: 12.5 }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#F06060"; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(139,130,190,0.12)"; }}
                    />

                    {deleteError && (
                      <p className="mt-2" style={{ fontSize: 11.5, color: "#F06060", lineHeight: 1.5 }}>
                        {deleteError}
                      </p>
                    )}

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeletePhrase("");
                          setDeleteError(null);
                        }}
                        disabled={deleting}
                        style={{ ...statusButtonBase, cursor: deleting ? "not-allowed" : "pointer" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={!canConfirmDelete}
                        style={{
                          ...statusButtonBase,
                          background: canConfirmDelete ? "rgba(240,96,96,0.14)" : "#1C1930",
                          borderColor: canConfirmDelete
                            ? "rgba(240,96,96,0.45)"
                            : "rgba(139,130,190,0.12)",
                          color: canConfirmDelete ? "#F06060" : "#6A6580",
                          cursor: canConfirmDelete ? "pointer" : "not-allowed",
                          opacity: canConfirmDelete ? 1 : 0.5,
                        }}
                      >
                        {deleting ? "Deleting…" : "Delete application"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Side notes panel */}
            {notesOpen && (
              <div
                key={activeApp.id}
                className="rcc-notes-panel shrink-0 flex flex-col overflow-hidden relative"
                style={{
                  width: notesPanelWidth,
                  borderLeft: "0.5px solid rgba(139,130,190,0.12)",
                  background: "#0F0D1A",
                }}
              >
                {/* Drag handle — left edge of the right-side panel */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize notes panel"
                  tabIndex={0}
                  title="Drag to resize · Double-click to reset"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 6,
                    cursor: "col-resize",
                    zIndex: 10,
                    background: handleHover || isDragging
                      ? "rgba(139,127,238,0.18)"
                      : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    dragRef.current = { startX: e.clientX, startWidth: notesPanelWidth };
                    setIsDragging(true);
                  }}
                  onDoubleClick={() => setNotesPanelWidth(NOTES_DEFAULT_WIDTH)}
                  onMouseEnter={() => setHandleHover(true)}
                  onMouseLeave={() => setHandleHover(false)}
                  onKeyDown={(e) => {
                    const STEP = 20;
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      setNotesPanelWidth((w) => Math.min(NOTES_MAX_WIDTH, w + STEP));
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      setNotesPanelWidth((w) => Math.max(NOTES_MIN_WIDTH, w - STEP));
                    } else if (e.key === "Enter" || e.key === "Home") {
                      e.preventDefault();
                      setNotesPanelWidth(NOTES_DEFAULT_WIDTH);
                    }
                  }}
                />
                {/* Panel header */}
                <div
                  className="flex items-center justify-between px-4 py-3 shrink-0"
                  style={{ borderBottom: "0.5px solid rgba(139,130,190,0.08)" }}
                >
                  <div className="flex items-center gap-2">
                    {/* Subtle glow dot */}
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#8B7FEE",
                        boxShadow: "0 0 6px 2px rgba(139,127,238,0.45)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#A09BB5", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      Notes
                    </span>
                  </div>
                  {/* Tab switcher */}
                  <div className="flex gap-0.5">
                    {visibleFields.map((field) => {
                      const tab = NOTE_TABS.find((t) => t.field === field)!;
                      const isActive = activeField === field;
                      const shortLabel = tab.label.replace(" Notes", "");
                      return (
                        <button
                          key={field}
                          onClick={() => setActiveNotesTab(field)}
                          className="px-2 py-0.5 transition-colors"
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            borderRadius: 5,
                            ...(isActive
                              ? { background: "rgba(139,127,238,0.18)", color: "#8B7FEE" }
                              : { background: "transparent", color: "#6A6580" }),
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "#6A6580";
                          }}
                        >
                          {shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Textarea area — flex-1 so it fills remaining height */}
                <div className="flex-1 flex flex-col px-4 py-3 min-h-0">
                  <textarea
                    value={noteDrafts[activeField]}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [activeField]: e.target.value }))}
                    onBlur={saveNotes}
                    placeholder={NOTE_TABS.find((t) => t.field === activeField)!.placeholder}
                    className="flex-1 resize-none focus:outline-none transition-colors"
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: 12,
                      lineHeight: "1.7",
                      color: "#EAE8F2",
                      width: "100%",
                    }}
                    onFocus={(e) => { e.currentTarget.style.color = "#EAE8F2"; }}
                  />
                </div>

                {/* Panel footer */}
                <div
                  className="px-4 py-2 shrink-0 flex items-center justify-between"
                  style={{ borderTop: "0.5px solid rgba(139,130,190,0.08)" }}
                >
                  <p style={{ fontSize: 10, color: "#6A6580", fontStyle: "italic" }}>
                    {savingNotes ? "Saving…" : `Edited by ${modalSession?.user?.name ?? "Unknown"}`}
                  </p>
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: savingNotes ? "#F0B040" : "rgba(139,130,190,0.2)",
                      transition: "background 0.3s",
                    }}
                  />
                </div>
              </div>
            )}
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
  isSelected,
  anySelected,
  onToggleSelect,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  app: Application;
  onOpen: (app: Application) => void;
  isSelected: boolean;
  anySelected: boolean;
  onToggleSelect: (id: string) => void;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const emailSent = !!(EMAIL_STATUSES as readonly string[]).includes(app.status) && !!statusToSentAt(app.status, app);
  const showSentBadge = emailSent;
  const emailPending = (EMAIL_STATUSES as readonly string[]).includes(app.status) && !statusToSentAt(app.status, app);
  const rankedPrefs = getRankedPreferences(app.rawData);
  const showPrefers = app.track === "Ambassador" && rankedPrefs.length > 0;
  const showInterviewingFor = app.status === "Interviewing" && app.interview_roles.length > 0;

  function handleCardClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    el.classList.remove("rcc-card-press");
    void el.offsetWidth;
    el.classList.add("rcc-card-press");
    onOpen(app);
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleSelect(app.id);
  }

  const cardBorder = isSelected
    ? "2px solid #a78bfa"
    : "1px solid rgba(255,255,255,0.06)";
  const cardOpacity = anySelected && !isSelected ? 0.45 : 1;

  // Accepting creates a Placement keyed on applicant+track+season with no reference
  // back to the application, and closes sibling applications. Dragging out of
  // Accepted would orphan that placement, so Accepted cards never move by drag.
  const canDrag = !anySelected && app.status !== "Accepted";

  return (
    <div
      className="rcc-card relative cursor-pointer select-none group"
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", app.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(app.id);
      }}
      onDragEnd={onDragEnd}
      style={{
        padding: "13px 15px",
        borderRadius: 12,
        background: isSelected ? "rgba(167,139,250,0.08)" : "#15141e",
        border: cardBorder,
        transition: "transform 0.16s ease, border-color 0.16s, background 0.16s, box-shadow 0.16s, opacity 0.16s",
        opacity: isDragging ? 0.4 : cardOpacity,
      }}
      onClick={handleCardClick}
    >
      {/* Selection checkbox — top-left corner */}
      <div
        className={`absolute top-2 left-2 z-10 ${anySelected ? "flex" : "hidden group-hover:flex"}`}
        onClick={handleCheckboxClick}
        // Cancelling dragstart here stops a drag begun on the checkbox from dragging
        // the card. draggable={false} on a child is not reliable across browsers.
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => { /* controlled via onClick */ }}
          onClick={handleCheckboxClick}
          aria-label={`Select ${app.applicant.name}`}
          style={{
            width: 15,
            height: 15,
            cursor: "pointer",
            accentColor: "#a78bfa",
            borderRadius: 4,
          }}
        />
      </div>

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{
            width: 38,
            height: 38,
            background: "rgba(167,139,250,0.16)",
            border: "1px solid rgba(167,139,250,0.30)",
            color: "#c4b5fd",
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: "0.3px",
          }}
        >
          {getInitials(app.applicant.name)}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
          <div
            className="truncate"
            style={{ fontSize: 14, fontWeight: 600, color: "#ECEAF3", letterSpacing: "-0.1px" }}
          >
            {app.applicant.name}
          </div>
          {/* Matrix imports set role to the 1st preference, so the Prefers line already shows it. */}
          {!showPrefers && (
            <div
              className="truncate"
              style={{ fontSize: 12.5, color: "#9a98ab", fontWeight: 500 }}
            >
              {app.role}
            </div>
          )}
          {showPrefers && (
            <div
              className="truncate"
              style={{ fontSize: 11.5, color: "#6c6a7d", fontWeight: 500, marginTop: 1 }}
            >
              {`Prefers: ${rankedPrefs.map((p) => `${p.rank}) ${p.role}`).join(" · ")}`}
            </div>
          )}
          {showInterviewingFor && (
            <div
              className="truncate"
              style={{ fontSize: 11.5, color: "#a78bfa", fontWeight: 500, marginTop: 2 }}
            >
              {`Interviewing for: ${app.interview_roles.join(", ")}`}
            </div>
          )}
        </div>

        {/* Sent badge */}
        {showSentBadge && (
          <div
            className="shrink-0 flex items-center"
            style={{
              gap: 4,
              padding: "4px 8px",
              borderRadius: 7,
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.22)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="#34d399" strokeWidth="2" />
              <path d="M3 7l9 6 9-6" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#34d399", letterSpacing: "0.2px" }}>
              Sent
            </span>
          </div>
        )}

        {/* Email pending pill */}
        {emailPending && (
          <div
            className="shrink-0"
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(240,176,64,0.10)",
              border: "0.5px solid rgba(240,176,64,0.25)",
              fontSize: 11,
              fontWeight: 500,
              color: "#F0B040",
            }}
          >
            Email pending
          </div>
        )}
      </div>
    </div>
  );
}

// ── Board Column ──────────────────────────────────────────────────────────────

function Column({
  status,
  apps,
  onOpen,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  draggingId,
  onCardDrop,
  onCardDragStart,
  onCardDragEnd,
}: {
  status: Status;
  apps: Application[];
  onOpen: (app: Application) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  draggingId: string | null;
  onCardDrop: (id: string, status: Status) => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  // dragenter/dragleave also fire when crossing child elements, so depth-count
  // them rather than clearing the highlight on the first dragleave.
  const dragDepth = useRef(0);
  // Accepted runs placement logic, so it is never a drop target.
  const canDrop = draggingId !== null && status !== "Accepted";

  useEffect(() => {
    if (draggingId !== null) return;
    dragDepth.current = 0;
    setIsDragOver(false);
  }, [draggingId]);

  const showDropTarget = canDrop && isDragOver;
  const barColor = columnBarColor(status);
  const columnIds = apps.map((a) => a.id);
  const selectedInColumn = columnIds.filter((id) => selectedIds.has(id));
  const allSelected = columnIds.length > 0 && selectedInColumn.length === columnIds.length;
  const someSelected = selectedInColumn.length > 0 && !allSelected;
  const anySelected = selectedIds.size > 0;

  function handleColumnCheckbox(e: React.MouseEvent) {
    e.stopPropagation();
    onToggleAll(columnIds);
  }

  return (
    <div
      className="flex flex-col min-w-0 overflow-hidden h-full"
      style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: "16px 18px 12px 18px" }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          {/* Column select-all checkbox */}
          {apps.length > 0 && (
            <div
              className={`${anySelected ? "flex" : "hidden group-hover:flex"} items-center`}
              style={{ marginRight: 4 }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => { /* controlled via onClick */ }}
                onClick={handleColumnCheckbox}
                aria-label={`Select all in ${status}`}
                style={{
                  width: 14,
                  height: 14,
                  cursor: "pointer",
                  accentColor: "#a78bfa",
                }}
              />
            </div>
          )}
          <span
            style={{
              width: 3,
              height: 15,
              borderRadius: 3,
              background: barColor,
              boxShadow: `0 0 10px ${barColor}66`,
            }}
          />
          <span
            className="uppercase"
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "1.2px",
              color: "#8b8a99",
            }}
          >
            {status}
          </span>
        </div>
        <span
          className="inline-flex items-center justify-center"
          style={{
            minWidth: 22,
            height: 22,
            padding: "0 7px",
            borderRadius: 7,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
            fontSize: 12,
            fontWeight: 700,
            color: "#bbb9c9",
          }}
        >
          {apps.length}
        </span>
      </div>

      {/* Card list */}
      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{
          padding: "2px 14px 18px 18px",
          gap: 10,
          borderRadius: 12,
          background: showDropTarget ? `${barColor}14` : "transparent",
          outline: showDropTarget ? `1.5px dashed ${barColor}` : "none",
          outlineOffset: -6,
          transition: "background 0.15s",
        }}
        onDragOver={(e) => {
          if (!canDrop) return;
          // Only calling preventDefault on droppable columns is what makes the
          // browser show the "no drop" cursor over Accepted.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => {
          if (!canDrop) return;
          dragDepth.current += 1;
          setIsDragOver(true);
        }}
        onDragLeave={() => {
          if (!canDrop) return;
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsDragOver(false);
          }
        }}
        onDrop={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragOver(false);
          // The optimistic move unmounts the source card before the browser can
          // fire dragend on it, so that handler cannot be relied on to clear the
          // drag state after a cross-column drop. Clear it here instead.
          onCardDragEnd();
          const id = e.dataTransfer.getData("text/plain");
          if (id) onCardDrop(id, status);
        }}
      >
        {apps.map((app) => (
          <ApplicantCard
            key={app.id}
            app={app}
            onOpen={onOpen}
            isSelected={selectedIds.has(app.id)}
            anySelected={anySelected}
            onToggleSelect={onToggleSelect}
            isDragging={draggingId === app.id}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
          />
        ))}
        {apps.length === 0 && (
          <div
            className="flex items-center justify-center"
            style={{
              marginTop: 8,
              padding: "30px 16px",
              borderRadius: 12,
              border: showDropTarget
                ? `1.5px dashed ${barColor}`
                : "1.5px dashed rgba(255,255,255,0.08)",
              transition: "border-color 0.15s",
            }}
          >
            <span style={{ fontSize: 12.5, color: "#565465", fontWeight: 500 }}>No applicants</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Notes panel resize constants ──────────────────────────────────────────────
const NOTES_DEFAULT_WIDTH = 300;
const NOTES_MIN_WIDTH     = 260;
const NOTES_MAX_WIDTH     = 520;

// ── Pill style for command strip controls ─────────────────────────────────────
const stripPillStyle: React.CSSProperties = {
  background: "rgba(22,21,31,0.9)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#bbb9c9",
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 500,
  height: 40,
  padding: "0 14px",
  outline: "none",
};

// ── Bulk Interview Email Dialog ───────────────────────────────────────────────

// Local fill helper — mirrors emailTemplates.ts internal fill() without modifying that file.
function fillTemplate(template: string, data: { name: string; role: string; opportunity: string }): string {
  return template
    .replace(/\{\{name\}\}/g, data.name)
    .replace(/\{\{role\}\}/g, data.role)
    .replace(/\{\{opportunity\}\}/g, data.opportunity);
}

const EMAIL_RE_CLIENT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function BulkInterviewEmailDialog({
  selectedApps,
  onSend,
  onClose,
}: {
  selectedApps: Application[];
  onSend: (subject: string | null, body: string | null) => void;
  onClose: () => void;
}) {
  // Compute default subject/body from template (first app for preview)
  const firstApp = selectedApps[0];
  const defaultTemplate = firstApp
    ? getEmailTemplate("Interviewing", {
        name: firstApp.applicant.name,
        role: firstApp.role,
        opportunity: firstApp.opportunity,
      })
    : { subject: "", body: "" };

  // Use the unfilled template as editable defaults so placeholders are preserved
  const rawTemplate = getEmailTemplate("Interviewing", {
    name: "{{name}}",
    role: "{{role}}",
    opportunity: "{{opportunity}}",
  });

  const [subject, setSubject] = useState(rawTemplate.subject);
  const [body, setBody] = useState(rawTemplate.body);

  // Client-side counts (UX preview only — server is authoritative)
  const alreadySent = selectedApps.filter((a) => !!a.interview_invite_sent).length;
  const noEmail = selectedApps.filter((a) => !EMAIL_RE_CLIENT.test(a.applicant.email)).length;
  const sendable = selectedApps.length - alreadySent - noEmail;

  // Preview: fill subject/body for first app
  const previewData = firstApp
    ? { name: firstApp.applicant.name, role: firstApp.role, opportunity: firstApp.opportunity }
    : { name: "Recipient", role: "Role", opportunity: "Opportunity" };
  const previewSubject = fillTemplate(subject, previewData);
  const previewBody = fillTemplate(body, previewData);

  // When the reviewer hasn't edited either field, we omit both overrides and
  // let the server pick the per-recipient template branch (roles vs single).
  const isPristine =
    subject === rawTemplate.subject && body === rawTemplate.body;

  // If the message references {{roles}}, any recipient without interview_roles
  // would render a broken sentence. Preemptively block the send here; the
  // server enforces the same rule.
  const usesRolesPlaceholder =
    subject.includes("{{roles}}") || body.includes("{{roles}}");
  const missingRoles = selectedApps.filter(
    (a) => (a.interview_roles?.length ?? 0) === 0
  );
  const rolesGuardFail =
    !isPristine && usesRolesPlaceholder && missingRoles.length > 0;

  const rateLimitWarning = sendable > 10;
  const canSend = sendable > 0 && !rateLimitWarning && !rolesGuardFail;

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
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#EAE8F2" }}>Send interview emails</h3>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Counts */}
          <div className="space-y-1">
            <p style={{ fontSize: 13, color: "#A09BB5" }}>{sendable} recipient{sendable !== 1 ? "s" : ""}</p>
            {alreadySent > 0 && (
              <p style={{ fontSize: 12.5, color: "#6A6580" }}>{alreadySent} already sent — will be skipped</p>
            )}
            {noEmail > 0 && (
              <p style={{ fontSize: 12.5, color: "#6A6580" }}>{noEmail} missing valid email — will be skipped</p>
            )}
          </div>

          {/* Rate-limit warning */}
          {rateLimitWarning && (
            <div
              className="px-4 py-3"
              style={{ background: "rgba(240,176,64,0.08)", borderLeft: "3px solid #F0B040", borderRadius: 6 }}
            >
              <p style={{ fontSize: 13, color: "#F0B040" }}>
                You can send up to 10 emails per minute. Try a smaller batch or wait between sends.
              </p>
            </div>
          )}

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#6A6580", display: "block", marginBottom: 6 }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={modalInputCls}
              style={modalInputStyle}
            />
          </div>

          {/* Body */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#6A6580", display: "block", marginBottom: 6 }}>
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={modalInputCls}
              style={{ ...modalInputStyle, resize: "vertical" }}
            />
            <p style={{ fontSize: 11.5, color: "#6A6580", marginTop: 4 }}>
              Placeholders <code style={{ color: "#9a98ab" }}>{"{{name}}"}</code>,{" "}
              <code style={{ color: "#9a98ab" }}>{"{{role}}"}</code>,{" "}
              <code style={{ color: "#9a98ab" }}>{"{{opportunity}}"}</code>,{" "}
              <code style={{ color: "#9a98ab" }}>{"{{roles}}"}</code> are filled per recipient.
            </p>
          </div>

          {/* Missing-roles guard: message uses {{roles}} but some recipients have none */}
          {rolesGuardFail && (
            <div
              className="px-4 py-3"
              style={{ background: "rgba(240,96,96,0.08)", borderLeft: "3px solid #F06060", borderRadius: 6 }}
            >
              <p style={{ fontSize: 13, color: "#F06060", marginBottom: 4 }}>
                Cannot send: the message uses <code>{"{{roles}}"}</code> but{" "}
                {missingRoles.length} recipient{missingRoles.length === 1 ? "" : "s"}{" "}
                {missingRoles.length === 1 ? "has" : "have"} no interview roles set.
              </p>
              <p style={{ fontSize: 12, color: "#A09BB5" }}>
                {missingRoles.slice(0, 5).map((a) => a.applicant.name).join(", ")}
                {missingRoles.length > 5 ? `, and ${missingRoles.length - 5} more` : ""}.
              </p>
              <p style={{ fontSize: 12, color: "#6A6580", marginTop: 4 }}>
                Set interview roles for those applicants, or remove <code>{"{{roles}}"}</code> from the message.
              </p>
            </div>
          )}

          {/* Preview */}
          {firstApp && (
            <div
              className="px-4 py-3 space-y-2"
              style={{ background: "rgba(139,130,190,0.05)", border: "0.5px solid rgba(139,130,190,0.10)", borderRadius: 8 }}
            >
              <p style={{ fontSize: 11.5, fontWeight: 600, color: "#6A6580", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Preview — {firstApp.applicant.name}
              </p>
              <p style={{ fontSize: 12.5, color: "#A09BB5" }}>
                <span style={{ color: "#6A6580" }}>Subject: </span>{previewSubject}
              </p>
              <p style={{ fontSize: 12, color: "#A09BB5", whiteSpace: "pre-wrap" }}>{previewBody}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end shrink-0"
          style={{ borderTop: "0.5px solid rgba(139,130,190,0.08)", gap: 10 }}
        >
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#9a98ab",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8,
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canSend) return;
              onSend(isPristine ? null : subject, isPristine ? null : body);
            }}
            disabled={!canSend}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: canSend ? "#EAE8F2" : "#6b6a78",
              background: canSend ? "rgba(139,130,190,0.20)" : "rgba(139,130,190,0.06)",
              border: "1px solid " + (canSend ? "rgba(167,139,250,0.35)" : "rgba(255,255,255,0.08)"),
              borderRadius: 8,
              padding: "6px 16px",
              cursor: canSend ? "pointer" : "not-allowed",
            }}
          >
            Send {sendable} email{sendable !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Drop-to-Interviewing role picker (page-level) ─────────────────────────────
// Rendered by AdminPage when an Ambassador card with ranked preferences is
// dropped into the Interviewing column. Surfaces the same picker as the
// modal's confirmation overlay before the status change commits.
function DropRolePickerModal({
  app,
  onConfirm,
  onCancel,
  submitting,
}: {
  app: Application;
  onConfirm: (roles: string[]) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const options = getRankedPreferences(app.rawData);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (!submitting) onCancel(); }}
    >
      <div
        className="p-6 max-w-sm w-full mx-4 shadow-2xl"
        style={{ background: "#1C1930", border: "0.5px solid rgba(139,130,190,0.12)", borderRadius: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="leading-relaxed mb-5" style={{ fontSize: 13, color: "#EAE8F2" }}>
          Change{" "}
          <span style={{ color: "#8B7FEE", fontWeight: 600 }}>{app.applicant.name}</span>'s
          status to{" "}
          <span style={{ fontWeight: 600, color: "#EAE8F2" }}>Interviewing</span>?
        </p>

        <div className="mb-5">
          <p className="mb-2 uppercase tracking-[0.6px]" style={{ fontSize: 11, color: "#6A6580" }}>
            Roles being considered <span style={{ textTransform: "none" }}>(up to 3)</span>
          </p>
          <InterviewRolePicker
            options={options}
            selected={selected}
            onChange={setSelected}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-1.5 rounded-[8px] transition-colors disabled:opacity-50"
            style={{ fontSize: 12, border: "0.5px solid rgba(139,130,190,0.12)", color: "#A09BB5", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={submitting || selected.length === 0}
            title={selected.length === 0 ? "Select at least one role" : undefined}
            className="px-4 py-1.5 rounded-[8px] transition-colors disabled:opacity-50"
            style={{ fontSize: 12, background: "#6B5FCC", color: "#EAE8F2" }}
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        </div>
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
  const [selectedTeam, setSelectedTeam] = useState("All Teams");
  const [selectedPosition, setSelectedPosition] = useState("All Positions");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingOpportunity, setRenamingOpportunity] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [showBulkEmailDialog, setShowBulkEmailDialog] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Held while the drop-into-Interviewing role picker is open. The card is
  // NOT optimistically moved until the user confirms; cancel leaves the row
  // in its source column untouched.
  const [dropPending, setDropPending] = useState<Application | null>(null);
  const [dropSubmitting, setDropSubmitting] = useState(false);

  // Always a fresh object, so repeated identical messages still restart the timer.
  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone });
  }, []);

  // Single owner of the dismiss timer — the cleanup is what stops an earlier
  // toast's timer from cutting a later one short.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === "error" ? 4000 : 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const { data: session } = useSession();
  const sessionName = session?.user?.name ?? "User";
  const sessionInitials = getInitials(sessionName);
  // Import opportunity state (lifted from ImportButton)
  const importOpportunity = useImportOpportunity();

  const fetchOpportunities = useCallback((autoSelect = false) => {
    fetch("/api/applications?opportunities=true")
      .then((r) => {
        if (handleAuthFailure(r)) return null;
        return r.ok ? r.json() : [];
      })
      .catch(() => [])
      .then((data: unknown) => {
        if (data === null) return;
        const list = Array.isArray(data) ? (data as string[]) : [];
        setOpportunities(list);
        if (autoSelect && list.length > 0) setSelectedOpportunity(list[0]);
      });
  }, []);

  useEffect(() => {
    fetchOpportunities(true);
  }, [fetchOpportunities]);

  // pausedRef is true whenever a background silent refetch must not commit.
  // A ref (not state) avoids restarting the interval every time one of the many
  // pause-inducing flags flips. The effect below keeps it in sync with state.
  const pausedRef = useRef(false);

  const fetchAppsCore = useCallback(
    (opts: { silent: boolean }) => {
      if (!selectedOpportunity) return;
      if (!opts.silent) setLoadingApps(true);
      fetch(`/api/applications?opportunity=${encodeURIComponent(selectedOpportunity)}`)
        .then((r) => {
          if (handleAuthFailure(r)) return null;
          // Silent path: on error, keep prev state — no blank flash, no toast.
          if (!r.ok) return opts.silent ? null : [];
          return r.json();
        })
        .catch(() => (opts.silent ? null : []))
        .then((data: unknown) => {
          if (data === null) {
            if (!opts.silent) setLoadingApps(false);
            return;
          }
          // Commit-time guard: a fetch that started while nothing was open must
          // not clobber state if the user has since opened a modal or grabbed a
          // card. The next interval tick will retry once the pause clears.
          if (opts.silent && pausedRef.current) return;
          const next = Array.isArray(data) ? (data as Application[]) : [];
          setApplications((prev) => {
            // Skip the re-render entirely when nothing meaningful changed.
            // JSON.stringify is cheap enough at expected board sizes (100-300
            // rows) and avoids maintaining a hand-rolled diff.
            if (opts.silent && JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
          setSelectedIds((prev) => {
            if (prev.size === 0) return prev;
            const survivors = new Set(next.map((a) => a.id));
            let changed = false;
            const kept = new Set<string>();
            prev.forEach((id) => {
              if (survivors.has(id)) kept.add(id);
              else changed = true;
            });
            return changed ? kept : prev;
          });
          if (!opts.silent) setLoadingApps(false);
        });
    },
    [selectedOpportunity]
  );

  const fetchApps = useCallback(() => fetchAppsCore({ silent: false }), [fetchAppsCore]);
  const fetchAppsSilent = useCallback(() => fetchAppsCore({ silent: true }), [fetchAppsCore]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  // Keep pausedRef in sync with anything a silent refetch could disturb:
  // open modals, in-flight rename, active drag, or a backgrounded tab.
  useEffect(() => {
    pausedRef.current =
      selectedApp !== null ||
      dropPending !== null ||
      showBulkEmailDialog ||
      showAccessModal ||
      renamingOpportunity ||
      renameLoading ||
      draggingId !== null ||
      (typeof document !== "undefined" && document.hidden);
  }, [
    selectedApp,
    dropPending,
    showBulkEmailDialog,
    showAccessModal,
    renamingOpportunity,
    renameLoading,
    draggingId,
  ]);

  // Silent polling so cross-reviewer changes propagate without a manual reload.
  // Interval is torn down and rebuilt only on opportunity switch; per-tick pause
  // reads the ref so flag flips don't recreate the timer.
  useEffect(() => {
    if (!selectedOpportunity) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      fetchAppsSilent();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [selectedOpportunity, fetchAppsSilent]);

  // Return-from-hidden: refresh immediately so the reviewer doesn't wait up to
  // POLL_INTERVAL_MS to see state that changed while their tab was in the back.
  useEffect(() => {
    function onVisibilityChange() {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        pausedRef.current = true;
        return;
      }
      // Recompute the other pause conditions before firing.
      pausedRef.current =
        selectedApp !== null ||
        dropPending !== null ||
        showBulkEmailDialog ||
        showAccessModal ||
        renamingOpportunity ||
        renameLoading ||
        draggingId !== null;
      if (!pausedRef.current) fetchAppsSilent();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [
    fetchAppsSilent,
    selectedApp,
    dropPending,
    showBulkEmailDialog,
    showAccessModal,
    renamingOpportunity,
    renameLoading,
    draggingId,
  ]);

  // ── Bulk selection helpers ────────────────────────────────────────────────
  // Clear selection whenever the user switches to a different opportunity.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedOpportunity]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Selects all ids if none/some are selected; deselects all if all are selected.
  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allIn) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  // E-Board apps have track="Ambassador" but no _teamPreference1 key in rawData.
  // Real Ambassador apps always have _teamPreference1 injected by normalizeAmbassadorData,
  // even when empty. Use key presence (not truthiness) to avoid false-negatives on
  // boards where all leads filled in blank preferences.
  const hasAmbassadorTrack = applications.some((a) => a.track === "Ambassador");
  const isEboardBoard = hasAmbassadorTrack && !applications.some((a) => "_teamPreference1" in (a.rawData ?? {}));
  // Matrix Ambassador boards have the bracketed position columns in rawData.
  // They need a role/preference filter instead of the old team filter.
  const isMatrixAmbassadorBoard = hasAmbassadorTrack && !isEboardBoard &&
    applications.some((a) => Object.keys(a.rawData ?? {}).some((k) => k.startsWith(MATRIX_POSITION_PREFIX)));
  const isAmbassadorBoard = hasAmbassadorTrack && !isEboardBoard && !isMatrixAmbassadorBoard;
  const isPositionFilterable = (!isAmbassadorBoard && applications.length > 0) || isEboardBoard;

  function splitRoles(role: string): string[] {
    return role.split(",").map((r) => r.trim()).filter(Boolean);
  }

  const availablePositions = isPositionFilterable
    ? Array.from(
        new Set(
          isMatrixAmbassadorBoard
            // Collect all three ranked preferences so every selectable role appears
            ? applications.flatMap((a) =>
                [a.rawData?._teamPreference1, a.rawData?._teamPreference2, a.rawData?._teamPreference3]
                  .filter((p): p is string => Boolean(p))
              )
            : applications.flatMap((a) => (a.role ? splitRoles(a.role) : []))
        )
      ).sort()
    : [];

  useEffect(() => {
    if (!isAmbassadorBoard) setSelectedTeam("All Teams");
  }, [isAmbassadorBoard]);

  useEffect(() => {
    setSelectedPosition("All Positions");
  }, [selectedOpportunity]);

  const handleImportSuccess = useCallback(() => {
    fetchOpportunities(!selectedOpportunity);
    fetchApps();
  }, [fetchOpportunities, fetchApps, selectedOpportunity]);

  const handleStatusChange = useCallback(
    (id: string, newStatus: string, interviewRoles?: string[]) => {
      setApplications((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: newStatus, ...(interviewRoles !== undefined && { interview_roles: interviewRoles }) }
            : a
        )
      );
      // Pull concurrent changes by other reviewers now instead of waiting up
      // to POLL_INTERVAL_MS after our own action.
      fetchAppsSilent();
    },
    [fetchAppsSilent]
  );

  const handleCardDrop = useCallback(
    async (id: string, newStatus: Status) => {
      // Cleared before every early return below so no path can leave a card
      // stuck at drag opacity.
      setDraggingId(null);
      const app = applications.find((a) => a.id === id);
      if (!app) return;
      if (app.status === newStatus) return;
      // Accepted triggers placement logic and closes sibling applications, so it
      // stays behind the modal's confirmation flow. The column also refuses drops.
      if (newStatus === "Accepted") return;

      // Ambassador applicants with ranked preferences get the same role picker
      // the modal shows before the status change commits. E-Board rows (no
      // _teamPreference keys) and non-Ambassador rows fall through.
      if (newStatus === "Interviewing"
          && app.track === "Ambassador"
          && getRankedPreferences(app.rawData).length > 0) {
        setDropPending(app);
        return;
      }

      const previousStatus = app.status;
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
      );

      function revert() {
        setApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: previousStatus } : a))
        );
        showToast("Failed to move applicant. Please try again.", "error");
      }

      try {
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: newStatus }),
        });
        if (handleAuthFailure(res)) return;
        if (!res.ok) {
          revert();
          return;
        }
        showToast(`Moved to ${newStatus}`, "success");
        fetchAppsSilent();
      } catch {
        revert();
      }
    },
    [applications, showToast, fetchAppsSilent]
  );

  const confirmDropPending = useCallback(
    async (roles: string[]) => {
      if (!dropPending) return;
      const id = dropPending.id;
      const previousStatus = dropPending.status;
      setDropSubmitting(true);
      try {
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status: "Interviewing", interview_roles: roles }),
        });
        if (handleAuthFailure(res)) return;
        if (!res.ok) {
          showToast("Failed to move applicant. Please try again.", "error");
          return;
        }
        setApplications((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "Interviewing", interview_roles: roles } : a
          )
        );
        showToast(
          roles.length > 0 ? `Moved to Interviewing for ${roles.length} role${roles.length === 1 ? "" : "s"}` : "Moved to Interviewing",
          "success"
        );
        setDropPending(null);
        fetchAppsSilent();
      } catch {
        showToast("Failed to move applicant. Please try again.", "error");
      } finally {
        setDropSubmitting(false);
      }
      // previousStatus retained only for symmetry with handleCardDrop's revert;
      // we do not optimistically move the card, so no revert is needed.
      void previousStatus;
    },
    [dropPending, showToast, fetchAppsSilent]
  );

  const cancelDropPending = useCallback(() => {
    if (dropSubmitting) return;
    setDropPending(null);
  }, [dropSubmitting]);

  const handleCardDragStart = useCallback((id: string) => setDraggingId(id), []);
  const handleCardDragEnd = useCallback(() => setDraggingId(null), []);

  const handleDeleted = useCallback((id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("Application deleted", "success");
  }, [showToast]);

  const handleBulkStatus = useCallback(
    async (status: "Interviewing" | "Rejected") => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      // Snapshot current statuses for potential revert
      const snapshot = new Map(
        applications
          .filter((a) => selectedIds.has(a.id))
          .map((a) => [a.id, a.status])
      );

      // Optimistic update
      setApplications((prev) =>
        prev.map((a) => (selectedIds.has(a.id) ? { ...a, status } : a))
      );

      setIsBulkUpdating(true);
      try {
        const res = await fetch("/api/applications/bulk-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, status }),
        });

        if (handleAuthFailure(res)) return;

        if (!res.ok) {
          // Revert all
          setApplications((prev) =>
            prev.map((a) => {
              const orig = snapshot.get(a.id);
              return orig !== undefined ? { ...a, status: orig } : a;
            })
          );
          showToast("Bulk update failed. Please try again.", "error");
          return;
        }

        const data = (await res.json()) as { results: Array<{ id: string; ok: boolean; error?: string }> };
        const failed = data.results.filter((r) => !r.ok);
        const succeeded = data.results.filter((r) => r.ok);

        // Revert failed rows
        if (failed.length > 0) {
          setApplications((prev) =>
            prev.map((a) => {
              const failedEntry = failed.find((f) => f.id === a.id);
              if (!failedEntry) return a;
              const orig = snapshot.get(a.id);
              return orig !== undefined ? { ...a, status: orig } : a;
            })
          );
          // Keep failed ids selected; remove succeeded ids
          setSelectedIds((prev) => {
            const next = new Set(prev);
            succeeded.forEach((r) => next.delete(r.id));
            return next;
          });
        } else {
          // All succeeded — clear selection
          setSelectedIds(new Set());
        }

        const movedCount = succeeded.length;
        const failedCount = failed.length;
        const msg =
          failedCount === 0
            ? `${movedCount} moved to ${status}`
            : `${movedCount} moved, ${failedCount} failed`;
        showToast(msg, failedCount === 0 ? "success" : "error");
      } catch {
        // Network error — revert all
        setApplications((prev) =>
          prev.map((a) => {
            const orig = snapshot.get(a.id);
            return orig !== undefined ? { ...a, status: orig } : a;
          })
        );
        showToast("Bulk update failed. Please try again.", "error");
      } finally {
        setIsBulkUpdating(false);
      }
    },
    [selectedIds, applications, showToast]
  );

  const handleBulkEmail = useCallback(
    async (subject: string | null, body: string | null) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      setIsBulkSending(true);
      setShowBulkEmailDialog(false);
      try {
        // Pristine dialog sends omit subject/body so the server picks the
        // per-recipient template branch (roles vs single) via getEmailTemplate.
        const payload: { ids: string[]; subject?: string; body?: string } = { ids };
        if (subject !== null) payload.subject = subject;
        if (body !== null) payload.body = body;

        const res = await fetch("/api/applications/bulk-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (handleAuthFailure(res)) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const names = Array.isArray(data.missingRoleNames)
            ? (data.missingRoleNames as string[])
            : [];
          const suffix =
            names.length > 0
              ? ` (${names.slice(0, 3).join(", ")}${names.length > 3 ? `, +${names.length - 3} more` : ""})`
              : "";
          showToast(
            (data.error ?? "Bulk email failed. Please try again.") + suffix,
            "error"
          );
          return;
        }

        const data = (await res.json()) as {
          results: Array<
            | { id: string; ok: true; messageId: string }
            | { id: string; ok: false; skipped?: string; error?: string }
          >;
        };

        const sent = data.results.filter((r) => r.ok);
        const skipped = data.results.filter((r) => !r.ok && "skipped" in r);
        const failed = data.results.filter((r) => !r.ok && "error" in r);

        // Remove sent + skipped ids from selection; keep failed ids selected
        setSelectedIds((prev) => {
          const next = new Set(prev);
          sent.forEach((r) => next.delete(r.id));
          skipped.forEach((r) => next.delete(r.id));
          return next;
        });

        // Refetch to sync interview_invite_sent timestamps
        fetchApps();

        const parts: string[] = [];
        if (sent.length > 0) parts.push(`${sent.length} sent`);
        if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
        if (failed.length > 0) parts.push(`${failed.length} failed`);
        showToast(parts.join(" • "), failed.length === 0 ? "success" : "error");
      } catch {
        showToast("Bulk email failed. Please try again.", "error");
      } finally {
        setIsBulkSending(false);
      }
    },
    [selectedIds, fetchApps, showToast]
  );

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
      if (handleAuthFailure(res)) return;
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.error ?? "Failed to rename.");
        return;
      }
      fetch("/api/applications?opportunities=true")
        .then((r) => {
          if (handleAuthFailure(r)) return null;
          return r.ok ? r.json() : [];
        })
        .catch(() => [])
        .then((updated: unknown) => {
          if (updated === null) return;
          setOpportunities(Array.isArray(updated) ? (updated as string[]) : []);
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
    if (isPositionFilterable && selectedPosition !== "All Positions") {
      if (isMatrixAmbassadorBoard) {
        const prefs = [a.rawData?._teamPreference1, a.rawData?._teamPreference2, a.rawData?._teamPreference3];
        if (!prefs.some((p) => p === selectedPosition)) return false;
      } else {
        if (!splitRoles(a.role ?? "").includes(selectedPosition)) return false;
      }
    }
    return true;
  });

  const byStatus = (status: Status) => filtered.filter((a) => a.status === status);

  return (
    <main
      className="h-screen overflow-hidden flex flex-col"
      style={{
        fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif",
        color: "#ECEAF3",
        background:
          "radial-gradient(900px 500px at 12% -8%, rgba(124,58,237,0.16), transparent 60%), " +
          "radial-gradient(800px 500px at 88% -10%, rgba(219,39,119,0.10), transparent 55%), " +
          "#08070d",
      }}
    >
      {/* ── ZONE 1: Header ─────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "14px 26px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(10,9,15,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div className="flex items-center" style={{ gap: 13 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(140deg, #7c3aed, #db2777)",
              boxShadow: "0 6px 18px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
              fontWeight: 800,
              color: "#fff",
              fontSize: 17,
              letterSpacing: "-0.5px",
            }}
          >
            R
          </div>
          <div className="flex flex-col" style={{ gap: 1, lineHeight: 1.1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#ECEAF3", letterSpacing: "-0.2px" }}>
              RCC ATS
            </div>
            <div style={{ fontSize: 11.5, color: "#6c6a7d", fontWeight: 500, letterSpacing: "0.1px" }}>
              Applicant tracking system
            </div>
          </div>
        </div>

        <div className="flex items-center" style={{ gap: 16 }}>
          <span style={{ fontSize: 13.5, color: "#9a98ab", fontWeight: 500 }}>{sessionName}</span>
          {session?.user?.image ? (
            <img
              src={session.user.image}
              alt={sessionName}
              referrerPolicy="no-referrer"
              className="shrink-0 object-cover"
              style={{ width: 30, height: 30, borderRadius: "50%" }}
            />
          ) : (
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "linear-gradient(140deg, #7c3aed, #db2777)",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              {sessionInitials}
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="transition-colors"
            style={{
              fontSize: 13,
              color: "#6c6a7d",
              fontWeight: 500,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6c6a7d"; }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── ZONE 2: Command Strip ──────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0 relative"
        style={{
          gap: 12,
          padding: "14px 26px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* 1. Opportunity dropdown / inline rename */}
        {opportunities.length === 0 ? (
          <span style={{ ...stripPillStyle, color: "#6c6a7d", cursor: "default", display: "inline-flex", alignItems: "center" }}>
            No opportunities
          </span>
        ) : renamingOpportunity ? (
          <div className="flex items-center" style={{ gap: 6 }}>
            <input
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") { setRenamingOpportunity(false); setRenameError(null); }
              }}
              style={{ ...stripPillStyle, width: 200, color: "#ECEAF3" }}
            />
            <button
              onClick={handleRenameSubmit}
              disabled={renameLoading}
              className="transition-colors disabled:opacity-50"
              style={{
                background: "rgba(167,139,250,0.16)",
                border: "1px solid #a78bfa",
                color: "#c4b5fd",
                borderRadius: 10,
                padding: "0 14px",
                height: 40,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {renameLoading ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setRenamingOpportunity(false); setRenameError(null); }}
              style={{
                background: "rgba(22,21,31,0.9)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#9a98ab",
                borderRadius: 10,
                fontSize: 14,
                cursor: "pointer",
                height: 40,
                width: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
            {renameError && (
              <span
                className="absolute pointer-events-none"
                style={{ top: "100%", left: 26, fontSize: 11, color: "#f43f5e", whiteSpace: "nowrap" }}
              >
                {renameError}
              </span>
            )}
          </div>
        ) : (
          <div className="relative flex items-center" style={{ gap: 6 }}>
            <div className="relative inline-flex items-center" style={{ gap: 10, ...stripPillStyle }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#a78bfa",
                  boxShadow: "0 0 10px #a78bfa",
                  flexShrink: 0,
                }}
              />
              <select
                value={selectedOpportunity}
                onChange={(e) => setSelectedOpportunity(e.target.value)}
                className="appearance-none cursor-pointer bg-transparent"
                style={{
                  border: "none",
                  outline: "none",
                  color: "#ECEAF3",
                  fontSize: 13.5,
                  fontWeight: 600,
                  paddingRight: 22,
                  background: "transparent",
                  maxWidth: 220,
                }}
              >
                {opportunities.map((o) => (
                  <option key={o} value={o} style={{ background: "#15141e", color: "#ECEAF3" }}>{o}</option>
                ))}
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5, position: "absolute", right: 12, pointerEvents: "none" }}>
                <path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {selectedOpportunity && (
              <button
                onClick={() => { setRenameValue(selectedOpportunity); setRenamingOpportunity(true); setRenameError(null); }}
                title="Rename opportunity"
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(22,21,31,0.9)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  color: "#9a98ab",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#a78bfa"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 2. Ambassador team filter */}
        {isAmbassadorBoard && (
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="appearance-none cursor-pointer"
            style={{ ...stripPillStyle, color: "#ECEAF3", paddingRight: 32 }}
          >
            <option value="All Teams" style={{ background: "#15141e" }}>All Teams</option>
            {AMBASSADOR_TEAMS.map((t) => (
              <option key={t} value={t} style={{ background: "#15141e" }}>{t}</option>
            ))}
          </select>
        )}

        {/* 2b. Position filter */}
        {isPositionFilterable && availablePositions.length > 1 && (
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="appearance-none cursor-pointer"
            style={{ ...stripPillStyle, color: "#ECEAF3", paddingRight: 32, minWidth: 190 }}
          >
            <option value="All Positions" style={{ background: "#15141e" }}>All Positions</option>
            {availablePositions.map((p) => (
              <option key={p} value={p} style={{ background: "#15141e" }}>{p}</option>
            ))}
          </select>
        )}

        {/* 3. Search */}
        <div className="relative" style={{ flex: 1, maxWidth: 380 }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="7" stroke="#6c6a7d" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="#6c6a7d" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{
              ...stripPillStyle,
              width: "100%",
              paddingLeft: 38,
              color: search ? "#ECEAF3" : "#bbb9c9",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Manage Access */}
        <button
          onClick={() => setShowAccessModal(true)}
          className="flex items-center transition-colors"
          style={{
            ...stripPillStyle,
            gap: 8,
            color: "#bbb9c9",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.18)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="#9a98ab" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" stroke="#9a98ab" strokeWidth="2" />
            <path d="M22 11h-6M19 8v6" stroke="#9a98ab" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Manage Access</span>
        </button>

        {/* Import */}
        <ImportButton
          selectedOpportunity={importOpportunity.selectedOpportunity}
          onImportSuccess={handleImportSuccess}
          importOpportunity={importOpportunity}
        />
      </div>

      {/* ── Selection Toolbar (shown when 1+ cards are selected) ────────────── */}
      {selectedIds.size > 0 && (
        <div
          className="shrink-0 flex items-center"
          style={{
            gap: 12,
            padding: "8px 26px",
            background: "rgba(167,139,250,0.10)",
            borderBottom: "1px solid rgba(167,139,250,0.20)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#c4b5fd" }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={clearSelection}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "#9a98ab",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 7,
              padding: "3px 10px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(167,139,250,0.35)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9a98ab"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
          >
            Clear selection
          </button>
          <button
            onClick={() => handleBulkStatus("Interviewing")}
            disabled={isBulkUpdating}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: isBulkUpdating ? "#6b6a78" : "#9a98ab",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 7,
              padding: "3px 10px",
              cursor: isBulkUpdating ? "not-allowed" : "pointer",
              opacity: isBulkUpdating ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isBulkUpdating) {
                (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(167,139,250,0.35)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = isBulkUpdating ? "#6b6a78" : "#9a98ab";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
            }}
          >
            Move to Interviewing
          </button>
          <button
            onClick={() => handleBulkStatus("Rejected")}
            disabled={isBulkUpdating}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: isBulkUpdating ? "#6b6a78" : "#9a98ab",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 7,
              padding: "3px 10px",
              cursor: isBulkUpdating ? "not-allowed" : "pointer",
              opacity: isBulkUpdating ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isBulkUpdating) {
                (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(167,139,250,0.35)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = isBulkUpdating ? "#6b6a78" : "#9a98ab";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
            }}
          >
            Move to Rejected
          </button>
          {/* Send interview emails button — only active when ALL selected are Interviewing */}
          {(() => {
            const selectedApps = applications.filter((a) => selectedIds.has(a.id));
            const allInterviewing = selectedApps.length > 0 && selectedApps.every((a) => a.status === "Interviewing");
            const disabled = !allInterviewing || isBulkUpdating || isBulkSending;
            const tooltipText = !allInterviewing
              ? "Only available when all selected applicants are in Interviewing"
              : isBulkSending
              ? "Sending…"
              : undefined;
            return (
              <button
                onClick={() => setShowBulkEmailDialog(true)}
                disabled={disabled}
                title={tooltipText}
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: disabled ? "#6b6a78" : "#9a98ab",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 7,
                  padding: "3px 10px",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    (e.currentTarget as HTMLButtonElement).style.color = "#c4b5fd";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(167,139,250,0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = disabled ? "#6b6a78" : "#9a98ab";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
                }}
              >
                {isBulkSending ? "Sending…" : "Send interview emails…"}
              </button>
            );
          })()}
        </div>
      )}

      {/* ── ZONE 3: Board Area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden" style={{ padding: "0 14px 0 0" }}>
        {loadingApps ? (
          <p className="text-sm" style={{ padding: "16px 26px", color: "#9a98ab" }}>Loading...</p>
        ) : (
          <div className="grid grid-cols-4 h-full" style={{ minHeight: 0 }}>
            {STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                apps={byStatus(status)}
                onOpen={setSelectedApp}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleAll={toggleSelectAll}
                draggingId={draggingId}
                onCardDrop={handleCardDrop}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
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
          onDeleted={handleDeleted}
          onRefreshBoard={fetchApps}
          onToast={showToast}
          boardOpportunity={selectedOpportunity}
        />
      )}

      {/* Drop-to-Interviewing role picker */}
      {dropPending && (
        <DropRolePickerModal
          app={dropPending}
          onConfirm={confirmDropPending}
          onCancel={cancelDropPending}
          submitting={dropSubmitting}
        />
      )}

      {/* Manage Access modal */}
      {showAccessModal && (
        <ManageAccessModal onClose={() => setShowAccessModal(false)} />
      )}

      {/* Bulk interview email dialog */}
      {showBulkEmailDialog && (
        <BulkInterviewEmailDialog
          selectedApps={applications.filter((a) => selectedIds.has(a.id))}
          onSend={handleBulkEmail}
          onClose={() => setShowBulkEmailDialog(false)}
        />
      )}

      {/* Bulk action toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] text-sm font-medium px-5 py-2.5 shadow-lg"
          style={{ ...TOAST_TONE_STYLE[toast.tone], borderRadius: 8 }}
        >
          {toast.message}
        </div>
      )}
    </main>
  );
}
