"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

// ── Sub-components ────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: "linear-gradient(135deg, #6B5FCC, #D4537E)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 0 0 1px rgba(139,130,190,0.15), 0 4px 12px rgba(107,95,204,0.25)",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: "#EAE8F2", letterSpacing: "-0.5px" }}>R</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FeaturePill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(139,130,190,0.07)",
        border: "0.5px solid rgba(139,130,190,0.15)",
        borderRadius: 20,
        padding: "4px 10px",
        fontSize: 11,
        color: "#A09BB5",
        letterSpacing: "0.2px",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #8B7FEE, #D4537E)",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

// ── Inner form — needs Suspense for useSearchParams ───────────────────────────

function LoginFormInner() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // NextAuth redirects back to /login?error=<code> on failure.
  useEffect(() => {
    const code = searchParams.get("error");
    if (!code) return;
    switch (code) {
      case "CredentialsSignin":
        setError("Invalid email or password.");
        break;
      case "Configuration":
      case "OAuthSignin":
      case "OAuthCallback":
      case "OAuthCreateAccount":
      case "OAuthAccountNotLinked":
        setError("Google sign-in is currently unavailable. Check server configuration.");
        break;
      case "AccessDenied":
        setError("This Google account does not have access to RCC ATS. Contact an administrator.");
        break;
      default:
        setError("Unable to sign in. Please try again.");
    }
  }, [searchParams]);

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/admin" });
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes rotateBorder {
          0%   { --angle: 0deg; }
          100% { --angle: 360deg; }
        }
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        .card-border-ring {
          animation: rotateBorder 8s linear infinite;
          background: conic-gradient(from var(--angle), transparent 20%, #6B5FCC 40%, #8B7FEE 50%, #D4537E 60%, transparent 80%);
          border-radius: 15.5px;
          padding: 1.5px;
        }
        .login-fade-1 { animation: fadeUp 0.45s ease both 0.05s; }
        .login-fade-2 { animation: fadeUp 0.45s ease both 0.15s; }
        .login-fade-3 { animation: fadeUp 0.45s ease both 0.25s; }
        .login-fade-4 { animation: fadeUp 0.45s ease both 0.35s; }
        .login-fade-5 { animation: fadeUp 0.45s ease both 0.45s; }
        .google-btn {
          position: relative;
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
        }
        .google-btn:not(:disabled):hover {
          border-color: #6B5FCC !important;
          box-shadow: 0 0 0 1px rgba(107,95,204,0.3), 0 4px 20px rgba(107,95,204,0.15);
          transform: translateY(-1px);
        }
        .google-btn:not(:disabled):active {
          transform: translateY(0px);
        }
      `}</style>

      <main className="h-screen grid grid-cols-1 lg:grid-cols-2" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {/* ── LEFT PANEL — branding (desktop only) ────────────────────────── */}
        <div
          className="hidden lg:flex flex-col justify-between"
          style={{
            background: "#141120",
            borderRight: "0.5px solid rgba(139,130,190,0.12)",
            padding: "40px 44px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative orbs */}
          <div style={{ position: "absolute", top: -100, right: -100, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(107,95,204,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -80, left: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,83,126,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "40%", left: "60%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,127,238,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

          {/* Top section */}
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Logo row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogoMark />
              <div style={{ lineHeight: 1.1 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#EAE8F2", letterSpacing: "-0.3px" }}>RCC ATS</span>
              </div>
            </div>

            {/* Headline */}
            <div style={{ marginTop: 48 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.25, color: "#EAE8F2", margin: "0 0 12px", letterSpacing: "-0.5px" }}>
                Track every applicant.
                <br />
                <span style={{ background: "linear-gradient(90deg, #8B7FEE, #D4537E)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Place the right people.
                </span>
              </h1>
              <p style={{ fontSize: 14, color: "#A09BB5", lineHeight: 1.65, margin: 0, maxWidth: 320 }}>
                Your all-in-one solution for candidate selection, tracking, and placement.
              </p>
            </div>

            {/* Feature pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 28 }}>
              <FeaturePill label="Applicant Tracking" />
              <FeaturePill label="Role Management" />
              <FeaturePill label="Team Placement" />
            </div>
          </div>

          {/* Bottom quote */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              paddingTop: 24,
              borderTop: "0.5px solid rgba(139,130,190,0.08)",
            }}
          >
            <p style={{ fontSize: 13, color: "#6A6580", fontStyle: "italic", lineHeight: 1.7, margin: 0 }}>
              "All in one solution for data segregation, manual tracking, hiring conflicts, inefficient communication, and more."
            </p>
            <p style={{ marginTop: 10, fontSize: 12, color: "#6A6580", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 16, height: "0.5px", background: "#6A6580", verticalAlign: "middle" }} />
              RCC Executive Board
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL — sign in ────────────────────────────────────────── */}
        <div
          style={{
            background: "#0C0A14",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            position: "relative",
          }}
        >
          {/* Subtle background texture */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(107,95,204,0.06) 0%, transparent 100%)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 340, width: "100%", position: "relative", zIndex: 1 }}>

            {/* Mobile-only logo */}
            <div className="flex lg:hidden items-center justify-center gap-2.5" style={{ marginBottom: 32 }}>
              <LogoMark />
              <span style={{ fontSize: 18, fontWeight: 700, color: "#EAE8F2", letterSpacing: "-0.3px" }}>RCC ATS</span>
            </div>

            {/* Card — animated gradient border ring */}
            <div className="card-border-ring" style={{ boxShadow: "0 0 24px rgba(107,95,204,0.12), 0 24px 48px rgba(0,0,0,0.4)" }}>
            <div
              style={{
                background: "#141120",
                borderRadius: 14,
                padding: "32px 28px 28px",
                boxShadow: "0 1px 0 0 rgba(139,130,190,0.08) inset",
                position: "relative",
                overflow: "hidden",
              }}
            >

              {/* Header */}
              <div className="login-fade-1" style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#EAE8F2", margin: "0 0 5px", letterSpacing: "-0.3px" }}>
                  Welcome back
                </h2>
                <p style={{ fontSize: 13, color: "#6A6580", margin: 0, lineHeight: 1.5 }}>
                  Sign in to the RCC recruitment dashboard
                </p>
              </div>

              {/* Google button */}
              <div className="login-fade-2">
                <button
                  onClick={handleGoogle}
                  disabled={googleLoading}
                  className="google-btn w-full flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: "rgba(28,25,48,0.8)",
                    border: "0.5px solid rgba(139,130,190,0.18)",
                    borderRadius: 10,
                    padding: "13px 16px",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#EAE8F2",
                    cursor: "pointer",
                    width: "100%",
                    letterSpacing: "-0.1px",
                  }}
                >
                  <GoogleIcon />
                  {googleLoading ? "Redirecting…" : "Continue with Google"}
                </button>
              </div>

              {/* Error banner */}
              {error && (
                <div
                  className="login-fade-3"
                  style={{
                    marginTop: 16,
                    background: "rgba(240,96,96,0.07)",
                    border: "0.5px solid rgba(240,96,96,0.25)",
                    borderLeft: "3px solid #F06060",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ fontSize: 12, color: "#F06060", margin: 0, lineHeight: 1.5 }}>{error}</p>
                </div>
              )}

              {/* Helper text */}
              <div
                className="login-fade-4"
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "0.5px solid rgba(139,130,190,0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <p style={{ fontSize: 12, color: "#6A6580", margin: 0, textAlign: "center", lineHeight: 1.6 }}>
                  Access is managed by RCC administrators.
                </p>
                <p style={{ fontSize: 11, color: "#4A4560", margin: 0, textAlign: "center", lineHeight: 1.6 }}>
                  Use the Google account that was approved for ATS access.
                </p>
              </div>
            </div>
            </div>{/* end card-border-ring */}

            {/* Footer */}
            <p className="login-fade-5" style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#3D3A52" }}>
              RCC @ SJSU — Responsible Computing Club
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

// ── Page export — Suspense required for useSearchParams in App Router ─────────

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFormInner />
    </Suspense>
  );
}
