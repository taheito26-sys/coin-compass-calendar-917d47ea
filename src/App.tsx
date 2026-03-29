import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/supabaseAuth";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import AuthScreen from "@/components/AuthScreen";
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
          <div className="appUserBar" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "12px 18px 0" }}>
            {userLabel ? (
              <span style={{ fontSize: 12, color: "var(--muted, #a1a1aa)" }}>{userLabel}</span>
            ) : null}
            <button
              onClick={onLogout}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "6px 14px",
                color: "var(--muted, #a1a1aa)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
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

function AuthGate() {
  const { isLoaded, isSignedIn, userEmail, signOut } = useAuth();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <AuthScreen />;

  return <AppShell onLogout={signOut} userLabel={userEmail || "Signed in"} />;
}

export default function App() {
  return (
    <AuthProvider>
      <CryptoProvider>
        <AuthGate />
      </CryptoProvider>
    </AuthProvider>
  );
}
