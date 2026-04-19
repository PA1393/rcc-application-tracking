"use client";

import { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AtsUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
};

// ── Shared input style ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "#0C0A14",
  border: "0.5px solid rgba(139,130,190,0.14)",
  color: "#EAE8F2",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

function focusBorder(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#6B5FCC";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(107,95,204,0.1)";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(139,130,190,0.14)";
  e.currentTarget.style.boxShadow = "none";
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return email[0].toUpperCase();
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3 3.5l.7 7.7a.5.5 0 0 0 .5.45h5.6a.5.5 0 0 0 .5-.45L11 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#6A6580",
          letterSpacing: "0.8px",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: "rgba(139,130,190,0.08)" }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManageAccessModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AtsUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add-user form state
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-row removing state
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
        else setFetchError("Failed to load users.");
      })
      .catch(() => setFetchError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, name: addName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add user.");
        return;
      }
      setUsers((prev) => [...prev, data].sort((a, b) => a.email.localeCompare(b.email)));
      setAddEmail("");
      setAddName("");
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setRowError(null);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setRowError(data.error ?? "Failed to remove user.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setRowError("Network error. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <style>{`
        .access-row {
          transition: background 0.15s, opacity 0.15s;
        }
        .access-row:hover {
          background: rgba(36,32,64,0.5) !important;
        }
        .trash-btn {
          transition: color 0.15s, background 0.15s, border-color 0.15s;
        }
        .trash-btn:not(:disabled):hover {
          color: #F06060 !important;
          background: rgba(240,96,96,0.1) !important;
          border-color: rgba(240,96,96,0.3) !important;
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="w-full max-w-lg max-h-[88vh] flex flex-col"
          style={{
            background: "#141120",
            border: "0.5px solid rgba(139,130,190,0.16)",
            borderRadius: 14,
            boxShadow: "0 32px 64px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(139,130,190,0.06) inset",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top accent */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(90deg, transparent 0%, #6B5FCC 30%, #8B7FEE 50%, #D4537E 70%, transparent 100%)",
              borderRadius: "14px 14px 0 0",
              zIndex: 1,
            }}
          />

          {/* Header */}
          <div
            className="px-6 shrink-0"
            style={{
              paddingTop: 22,
              paddingBottom: 18,
              borderBottom: "0.5px solid rgba(139,130,190,0.08)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#EAE8F2", margin: "0 0 3px", letterSpacing: "-0.2px" }}>
                Manage Access
              </h3>
              <p style={{ fontSize: 12, color: "#6A6580", margin: 0, lineHeight: 1.5 }}>
                Users listed here can sign in via Google. Access is invite-only.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(139,130,190,0.06)",
                border: "0.5px solid rgba(139,130,190,0.1)",
                borderRadius: 6,
                color: "#6A6580",
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1,
                padding: "5px 7px",
                marginTop: 2,
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,130,190,0.1)";
                (e.currentTarget as HTMLButtonElement).style.color = "#A09BB5";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,130,190,0.06)";
                (e.currentTarget as HTMLButtonElement).style.color = "#6A6580";
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5" style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Add user section */}
            <div>
              <SectionLabel>Add user</SectionLabel>
              <form onSubmit={handleAdd}>
                <div
                  style={{
                    background: "rgba(12,10,20,0.5)",
                    border: "0.5px solid rgba(139,130,190,0.1)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={addEmail}
                      onChange={(e) => { setAddEmail(e.target.value); setAddError(null); }}
                      placeholder="email@domain.com"
                      required
                      style={{ ...inputStyle, flex: 2 }}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                    />
                    <input
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{ ...inputStyle, flex: 1.4 }}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="submit"
                      disabled={adding}
                      style={{
                        background: adding ? "rgba(107,95,204,0.4)" : "#6B5FCC",
                        color: "#EAE8F2",
                        border: "none",
                        borderRadius: 8,
                        padding: "9px 20px",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: adding ? "not-allowed" : "pointer",
                        flexShrink: 0,
                        transition: "background 0.15s",
                        letterSpacing: "-0.1px",
                      }}
                      onMouseEnter={(e) => {
                        if (!adding) (e.currentTarget as HTMLButtonElement).style.background = "#8B7FEE";
                      }}
                      onMouseLeave={(e) => {
                        if (!adding) (e.currentTarget as HTMLButtonElement).style.background = "#6B5FCC";
                      }}
                    >
                      {adding ? "Adding…" : "Add"}
                    </button>
                  </div>
                  {addError && (
                    <p style={{ fontSize: 12, color: "#F06060", margin: 0, paddingTop: 2 }}>{addError}</p>
                  )}
                </div>
              </form>
            </div>

            {/* User list section */}
            <div>
              <SectionLabel>Current users ({users.length})</SectionLabel>

              {loading && (
                <p style={{ fontSize: 13, color: "#6A6580", textAlign: "center", padding: "20px 0" }}>Loading…</p>
              )}
              {fetchError && (
                <div style={{ background: "rgba(240,96,96,0.07)", border: "0.5px solid rgba(240,96,96,0.2)", borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ fontSize: 13, color: "#F06060", margin: 0 }}>{fetchError}</p>
                </div>
              )}
              {!loading && !fetchError && users.length === 0 && (
                <p style={{ fontSize: 13, color: "#6A6580", textAlign: "center", padding: "20px 0" }}>No users yet.</p>
              )}

              {rowError && (
                <div style={{ background: "rgba(240,96,96,0.07)", border: "0.5px solid rgba(240,96,96,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: "#F06060", margin: 0 }}>{rowError}</p>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {users.map((user) => {
                  const isRemoving = removingId === user.id;
                  return (
                    <div
                      key={user.id}
                      className="access-row flex items-center gap-3"
                      style={{
                        background: "#1C1930",
                        border: "0.5px solid rgba(139,130,190,0.08)",
                        borderRadius: 10,
                        padding: "11px 14px",
                        opacity: isRemoving ? 0.55 : 1,
                      }}
                    >
                      {/* Avatar */}
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name ?? user.email}
                          referrerPolicy="no-referrer"
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid rgba(139,130,190,0.15)" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #6B5FCC, #D4537E)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            boxShadow: "0 0 0 1.5px rgba(139,130,190,0.15)",
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#EAE8F2" }}>
                            {getInitials(user.name, user.email)}
                          </span>
                        </div>
                      )}

                      {/* Identity */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: "#EAE8F2", margin: 0, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.1px" }}>
                          {user.name ?? <span style={{ color: "#6A6580", fontWeight: 400 }}>No name</span>}
                        </p>
                        <p style={{ fontSize: 11, color: "#6A6580", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {user.email}
                        </p>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemove(user.id)}
                        disabled={isRemoving}
                        title="Remove access"
                        className="trash-btn"
                        style={{
                          background: "transparent",
                          border: "0.5px solid rgba(139,130,190,0.1)",
                          borderRadius: 7,
                          color: "#6A6580",
                          padding: "6px 7px",
                          cursor: isRemoving ? "not-allowed" : "pointer",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isRemoving ? (
                          <span style={{ fontSize: 10, color: "#6A6580", padding: "0 2px" }}>…</span>
                        ) : (
                          <TrashIcon />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
