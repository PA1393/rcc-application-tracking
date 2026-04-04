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
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, color: "#EAE8F2" }}>R</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ── Shared input style ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "#1C1930",
  border: "0.5px solid rgba(139,130,190,0.12)",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  color: "#EAE8F2",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#6A6580",
  marginBottom: 4,
};

// ── Inner form — needs Suspense for useSearchParams ───────────────────────────

function LoginFormInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // NextAuth redirects back to /login?error=<code> on failure.
  // Map known codes to human-readable messages.
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
        setError(
          "Google sign-in is currently unavailable. Check server configuration."
        );
        break;
      case "AccessDenied":
        setError(
          "This Google account does not have access to RCC ATS. Contact an administrator."
        );
        break;
      default:
        setError("Unable to sign in. Please try again.");
    }
  }, [searchParams]);

  // ── Auth handlers (preserved exactly) ──────────────────────────────────────

  async function handleCredentials(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl: "/admin",
      redirect: false,
    });
    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
    } else if (result?.url) {
      window.location.href = result.url;
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/admin" });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="h-screen grid grid-cols-1 lg:grid-cols-2">

      {/* ── LEFT PANEL — branding (desktop only) ──────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{
          background: "#141120",
          borderRight: "0.5px solid rgba(139,130,190,0.12)",
          padding: 32,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative circles — solid fills, no blur */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(107,95,204,0.06)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 250,
            height: 250,
            borderRadius: "50%",
            background: "rgba(212,83,126,0.04)",
            pointerEvents: "none",
          }}
        />

        {/* Top section */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Logo row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoMark />
            <span style={{ fontSize: 18, fontWeight: 600, color: "#EAE8F2" }}>
              RCC ATS
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginTop: 40 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                lineHeight: 1.3,
                color: "#EAE8F2",
                margin: 0,
              }}
            >
              Track every applicant.
              <br />
              <span style={{ color: "#8B7FEE" }}>Place the right people.</span>
            </h1>
            <p
              style={{
                marginTop: 12,
                fontSize: 14,
                color: "#A09BB5",
                lineHeight: 1.6,
              }}
            >
              Your all-in-one solution for candidate selection, tracking, and placement.


            </p>
          </div>
        </div>

        {/* Bottom section — testimonial */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <p
            style={{
              fontSize: 14,
              color: "#A09BB5",
              fontStyle: "italic",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
           All in one solution for Data Segregation, Manual Tracking, Hiring Conflicts, Inefficent Communication, and more.  </p>
          <p style={{ marginTop: 8, fontSize: 12, color: "#6A6580" }}>
            — RCC Executive Board
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ────────────────────────────────────────────── */}
      <div
        style={{
          background: "#0C0A14",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 320, width: "100%" }}>

          {/* Mobile-only logo (hidden on lg+) */}
          <div
            className="flex lg:hidden items-center justify-center gap-2.5"
            style={{ marginBottom: 24 }}
          >
            <LogoMark />
            <span style={{ fontSize: 18, fontWeight: 600, color: "#EAE8F2" }}>
              RCC ATS
            </span>
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#EAE8F2",
              margin: "0 0 4px",
            }}
          >
            Sign in
          </h2>
          <p style={{ fontSize: 13, color: "#6A6580", margin: "0 0 24px" }}>
            Access the RCC recruitment dashboard
          </p>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "#1C1930",
              border: "0.5px solid rgba(139,130,190,0.12)",
              borderRadius: 8,
              padding: 11,
              fontSize: 13,
              fontWeight: 500,
              color: "#EAE8F2",
              cursor: "pointer",
              marginBottom: 20,
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!googleLoading && !loading)
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "#6B5FCC";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "rgba(139,130,190,0.12)";
            }}
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                flex: 1,
                height: "0.5px",
                background: "rgba(139,130,190,0.12)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "#6A6580",
                padding: "0 12px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              or
            </span>
            <div
              style={{
                flex: 1,
                height: "0.5px",
                background: "rgba(139,130,190,0.12)",
              }}
            />
          </div>

          {/* Credentials form */}
          <form onSubmit={handleCredentials}>
            {/* Email */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@sjsu.edu"
                required
                autoComplete="email"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6B5FCC";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(139,130,190,0.12)";
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle} htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#6B5FCC";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(139,130,190,0.12)";
                }}
              />
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "#6B5FCC",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: 11,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                marginTop: 16,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!loading && !googleLoading)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#8B7FEE";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "#6B5FCC";
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            {/* Error message */}
            {error && (
              <p
                style={{
                  fontSize: 12,
                  color: "#F06060",
                  margin: "8px 0 0",
                }}
              >
                {error}
              </p>
            )}
          </form>

          {/* Access notice */}
          <p
            style={{
              textAlign: "center",
              marginTop: 16,
              fontSize: 12,
              color: "#6A6580",
            }}
          >
            Need access? Contact an RCC administrator.
          </p>

          {/* Footer */}
          <p
            style={{
              textAlign: "center",
              marginTop: 20,
              fontSize: 11,
              color: "#6A6580",
            }}
          >
            RCC @ SJSU — Responsible Computing Club
          </p>
        </div>
      </div>
    </main>
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
