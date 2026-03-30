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
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(4px)",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #8D1B3D 0%, #6A142D 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.7 : 1,
    boxShadow: "0 8px 24px rgba(141, 27, 61, 0.25)",
    transition: "transform 0.15s, box-shadow 0.15s",
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

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            background: "rgba(25, 25, 25, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 28,
            padding: 36,
            backdropFilter: "blur(20px)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.2px" }}>
            {mode === "signin" ? "Private Access" : mode === "signup" ? "New Portfolio" : "Reset Vault"}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 8 }}>
            {mode === "signin" && (
              <>
                <button onClick={() => { setMode("signup"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "#8D1B3D", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
                  Don't have an account? Create one
                </button>
                <button onClick={() => { setMode("forgot"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, padding: 0 }}>
                  Forgot your credentials?
                </button>
              </>
            )}
            {(mode === "signup" || mode === "forgot") && (
              <button onClick={() => { setMode("signin"); setError(null); setMessage(null); }} style={{ background: "none", border: "none", color: "#8D1B3D", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>
                ← Return to terminal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
