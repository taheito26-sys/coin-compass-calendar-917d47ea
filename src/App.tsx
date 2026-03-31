import React, { useState, useEffect } from "react";
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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0a0a", color: "#a1a1aa" }}>
      Loading authentication...
    </div>
  );
}

function AppShell({ onLogout, userLabel }: { onLogout: () => Promise<void>; userLabel?: string }) {
  const [page, setPage] = useState("dashboard");
  const { toastMsg } = useCrypto() || {};
  const [title, sub] = PAGE_TITLES[page] || ["Crypto Tracker", ""];
  console.log(`[AppShell] Rendering ${page}`);
  return (
    <div className="app">
      <Sidebar page={page} onNav={setPage} onLogout={onLogout} />
      <div className="mainWrap">
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
      {toastMsg ? <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div> : null}
    </div>
  );
}

function AuthGate() {
  const auth = useAuth();
  console.log("[AuthGate] Render", auth);
  if (!auth?.isLoaded) return <LoadingScreen />;
  if (!auth?.isSignedIn) return <AuthScreen />;
  return <AppShell onLogout={auth.signOut} userLabel={auth.userEmail || "Signed in"} />;
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
