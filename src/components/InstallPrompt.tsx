import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa_install_banner_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Soft, dismissible install prompt. Unlike a hard install gate, this never
 * blocks usage — it just offers the install action when the browser makes
 * one available (Android/desktop Chrome/Edge) or points iOS users at the
 * manual "Add to Home Screen" flow.
 */
export default function InstallPrompt() {
  const [installed, setInstalled] = useState(() => isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "true"
  );

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (installed || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--panel, #111)",
        border: "1px solid var(--line, #222)",
        boxShadow: "0 8px 24px rgba(0,0,0,.4)",
      }}
    >
      <span style={{ fontSize: 20 }}>⚡️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Install Crypto Tracker Pro</div>
        <div style={{ fontSize: 11, color: "var(--muted, #999)" }}>
          {isIOS && !deferredPrompt
            ? "Tap Share, then \"Add to Home Screen\""
            : "Add it to your home screen for quick access"}
        </div>
      </div>
      {deferredPrompt ? (
        <button className="btn tiny" onClick={install} style={{ background: "var(--brand)", color: "#fff", border: "none" }}>
          Install
        </button>
      ) : null}
      <button className="btn tiny secondary" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
