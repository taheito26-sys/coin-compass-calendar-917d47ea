import { useState } from "react";
import { SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import SettingsPage from "@/pages/SettingsPage";
import LedgerPage from "@/pages/LedgerPage";



const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs, Allocation, Heatmap"],
  assets: ["Portfolio", "Holdings, Lots, Alerts"],
  
  ledger: ["Ledger", "Transactions, Import, Connect"],
  calendar: ["Calendar", "Daily P&L, Per Coin"],
  markets: ["Markets", "Live Prices, Watchlist"],
  settings: ["Settings", "Theme, Data, Vault, Alerts"],
};

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg, #0a0a0a)",
        color: "var(--muted, #a1a1aa)",
      }}
    >
      Loading authentication...
    </div>
  );
}

function SignInScreen() {
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
            Use email and password for the simplest path. If Google or Microsoft login is enabled in
            Clerk, those buttons will appear automatically.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          }}
        >
          <SignIn routing="hash" />
        </div>
      </div>
    </div>
  );
}

function AppShell({
  onLogout,
  userLabel,
}: {
  onLogout: () => Promise<void>;
  userLabel?: string;
}) {
  const [page, setPage] = useState("dashboard");
  const { toastMsg } = useCrypto();
  const [title, sub] = PAGE_TITLES[page] || ["CryptoTracker", ""];

  return (
    <>
      <div className="app">
        <Sidebar page={page} onNav={setPage} onLogout={onLogout} />
        <div className="mainWrap">
          <div className="appUserBar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "12px 18px 0", }}>
            {userLabel ? (
              <span style={{ fontSize: 12, color: "var(--muted, #a1a1aa)" }}>{userLabel}</span>
            ) : null}
            <UserButton />
          </div>

          <Topbar title={title} sub={sub} onNav={setPage} />

          <div className="scroll">
            {page === "dashboard" && <DashboardPage onNav={setPage} />}
            {page === "assets" && <PortfolioPage />}
            
            {page === "ledger" && <LedgerPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "markets" && <MarketsPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </div>
      </div>

      {toastMsg ? <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div> : null}
    </>
  );
}

function ClerkRoot() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <SignInScreen />;
  }

  const userLabel =
    user?.primaryEmailAddress?.emailAddress || user?.username || user?.fullName || "Signed in";

  return <AppShell onLogout={() => signOut()} userLabel={userLabel} />;
}

export default function App() {
  return (
    <CryptoProvider>
      <ClerkRoot />
    </CryptoProvider>
  );
}
