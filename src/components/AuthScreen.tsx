/**
 * AuthScreen — Supabase Auth sign-in/sign-up UI
 * Replaces Clerk's <SignIn /> component.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for a confirmation link.");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent. Check your inbox.");
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text, #fff)",
    fontSize: 14,
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "hsl(var(--primary, 217 91% 60%))",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(59,130,246,0.15), transparent 30%), var(--bg, #0a0a0a)",
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div style={{ color: "var(--text, #ffffff)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              color: "var(--muted, #cbd5e1)",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            CoinCompass login
          </div>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "0 0 12px" }}>
            Sign in once, keep the portfolio synced everywhere.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--muted, #a1a1aa)", margin: 0 }}>
            Use email and password to sign in or create a new account.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: 28,
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text, #fff)" }}>
            {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
          </div>

          {message && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(34,197,94,0.15)", color: "#4ade80", fontSize: 13 }}>
              {message}
            </div>
          )}
          {error && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(239,68,68,0.15)", color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}

          <form
            onSubmit={mode === "signin" ? handleSignIn : mode === "signup" ? handleSignUp : handleForgotPassword}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            {mode !== "forgot" && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
            )}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading
                ? "Loading..."
                : mode === "signin"
                ? "Sign In"
                : mode === "signup"
                ? "Create Account"
                : "Send Reset Email"}
            </button>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--muted, #a1a1aa)" }}>
            {mode === "signin" && (
              <>
                <button onClick={() => { setMode("signup"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "hsl(var(--primary, 217 91% 60%))", cursor: "pointer", fontSize: 13, padding: 0 }}>
                  Don't have an account? Sign up
                </button>
                <button onClick={() => { setMode("forgot"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "var(--muted, #a1a1aa)", cursor: "pointer", fontSize: 13, padding: 0 }}>
                  Forgot password?
                </button>
              </>
            )}
            {(mode === "signup" || mode === "forgot") && (
              <button onClick={() => { setMode("signin"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "hsl(var(--primary, 217 91% 60%))", cursor: "pointer", fontSize: 13, padding: 0 }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
