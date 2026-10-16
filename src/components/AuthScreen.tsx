/**
 * AuthScreen — Google OAuth sign-in, with an email/password fallback.
 *
 * The Google button depends on a successful redirect round-trip through
 * Google's own consent screen, which can be unreliable in some mobile
 * browser/webview setups (popup blocking, third-party cookie restrictions,
 * in-app browsers). Email/password goes straight to Supabase with no
 * third-party hop, so it's a reliable way in when Google isn't cooperating.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setInfo("Account created. Check your email to confirm, then sign in.");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#080808",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative Glows */}
      <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "50%", height: "50%", background: "radial-gradient(circle, rgba(141, 27, 61, 0.15), transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "50%", height: "50%", background: "radial-gradient(circle, rgba(141, 141, 141, 0.05), transparent 70%)", pointerEvents: "none" }} />

      <div
        style={{
          width: "min(1000px, 100%)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 48,
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Left branding */}
        <div style={{ color: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <img src="/logo.png" alt="Logo" style={{ width: 48, height: 48, borderRadius: 12, boxShadow: "0 8px 16px rgba(0,0,0,0.5)" }} />
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>Crypto Tracker Pro</div>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(141, 27, 61, 0.2)",
              border: "1px solid rgba(141, 27, 61, 0.3)",
              color: "#fecaca",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 20,
            }}
          >
            Digital Asset Management
          </div>
          <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.05, margin: "0 0 20px", fontWeight: 800 }}>
            Institutional Grade <br /><span style={{ color: "#eee" }}>Portfolio Intelligence.</span>
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", margin: 0, maxWidth: 440 }}>
            Monitor your global crypto holdings with millisecond accuracy and multi-exchange synchronization.
          </p>
        </div>

        {/* Right sign-in card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            background: "rgba(25, 25, 25, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 28,
            padding: 36,
            backdropFilter: "blur(20px)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.2px", textAlign: "center" }}>
            Private Access
          </div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0, textAlign: "center" }}>
            Sign in with your Google account to continue.
          </p>

          {error && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 13, width: "100%" }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(34,197,94,0.15)", color: "#4ade80", fontSize: 13, width: "100%" }}>
              {info}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "#fff",
              color: "#1a1a1a",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "transform 0.15s, box-shadow 0.15s",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>

          {!showEmailForm ? (
            <button
              onClick={() => { setShowEmailForm(true); setError(null); setInfo(null); }}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "rgba(255,255,255,0.7)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Use email and password instead
            </button>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: 14,
                }}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: 14,
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--brand, #8D1B3D)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
              >
                {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
