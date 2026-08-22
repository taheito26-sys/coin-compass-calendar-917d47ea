import { useCallback, useEffect, useState } from "react";
import type { GateStage } from "@/lib/installGate";
import { isInAppBrowser } from "@/lib/installGate";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallGateScreen({ stage }: { stage: GateStage }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const inAppBrowser = isInAppBrowser(ua);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060606",
        color: "#fff",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          border: "1px solid #222",
          padding: 36,
          borderRadius: 20,
          background: "#0a0a0a",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>📲</div>

        {stage === "awaiting-launch" ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Almost there</h1>
            <p style={{ color: "#999", lineHeight: 1.6, marginBottom: 4 }}>
              Crypto Tracker Pro is installed. Close this tab and open the app from your home screen to continue.
            </p>
          </>
        ) : inAppBrowser ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Open in your browser</h1>
            <p style={{ color: "#999", lineHeight: 1.6, marginBottom: 4 }}>
              This app can't be installed from inside this in-app browser. Tap the menu button and choose
              "Open in Chrome" or "Open in Safari" to continue.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Install Crypto Tracker Pro</h1>
            <p style={{ color: "#999", lineHeight: 1.6, marginBottom: 20 }}>
              Please install the app to your home screen to continue on mobile.
            </p>

            {isIOS ? (
              <div style={{ background: "#111", padding: 16, borderRadius: 12, textAlign: "left", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>
                  How to install on iPhone
                </div>
                <ol style={{ fontSize: 13, color: "#ccc", paddingLeft: 20, margin: 0 }}>
                  <li>Tap the Share button in Safari</li>
                  <li>Tap "Add to Home Screen"</li>
                  <li>Open the app from your home screen</li>
                </ol>
              </div>
            ) : deferredPrompt ? (
              <button
                onClick={install}
                className="btn"
                style={{ width: "100%", background: "var(--brand)", padding: 12 }}
              >
                Install Now
              </button>
            ) : (
              <div style={{ background: "#111", padding: 16, borderRadius: 12, textAlign: "left", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>
                  How to install
                </div>
                <ol style={{ fontSize: 13, color: "#ccc", paddingLeft: 20, margin: 0 }}>
                  <li>Open the browser menu (⋮)</li>
                  <li>Tap "Install app" or "Add to Home screen"</li>
                  <li>Open the app from your home screen</li>
                </ol>
              </div>
            )}
          </>
        )}

        <button
          onClick={() => window.location.reload()}
          className="btn"
          style={{ width: "100%", background: "transparent", border: "1px solid #333", padding: 12, marginTop: 16 }}
        >
          I've installed it — Check again
        </button>
      </div>
    </div>
  );
}
