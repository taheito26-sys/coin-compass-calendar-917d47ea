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
import WhalePage from "@/pages/WhalePage";
import OpportunitiesPage from "@/pages/OpportunitiesPage";
import { useSentimentAlerts } from "@/hooks/useSentimentAlerts";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs, Allocation, Heatmap"],
  assets: ["Portfolio", "Holdings, Lots, Alerts"],
  ledger: ["Ledger", "Transactions, Import, Connect"],
  calendar: ["Calendar", "Daily P&L, Per Coin"],
  markets: ["Markets", "Live Prices, Watchlist"],
  opportunities: ["Opportunities", "Listings, Airdrops, Delistings"],
  whale: ["Whale Tracker", "Live Whale Movements"],
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
              {page === "opportunities" && <OpportunitiesPage />}
              {page === "whale" && <WhalePage />}
              {page === "settings" && <SettingsPage />}
        </div>
      </div>
      {toastMsg ? <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div> : null}
    </div>
  );
}

function MissingConfigScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#060606", color: "#fff", padding: 20 }}>
      <div style={{ maxWidth: 450, width: "100%", textAlign: "center", border: "1px solid #222", padding: 40, borderRadius: 20, background: "#0a0a0a" }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>⚡️</div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>Configuration Required</h1>
        <p style={{ color: "#888", marginBottom: 30, lineHeight: 1.6 }}>
          To start using the CoinCompass Dashboard, you need to connect your Supabase project.
        </p>
        <div style={{ background: "#111", padding: 16, borderRadius: 12, textAlign: "left", marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 800, marginBottom: 8, textTransform: "uppercase" }}>Instructions:</div>
          <ol style={{ fontSize: 13, color: "#ccc", paddingLeft: 20, margin: 0 }}>
            <li>Create a <code>.env</code> file in the project root.</li>
            <li>Add your <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_PUBLISHABLE_KEY</b>.</li>
            <li>Restart your development server.</li>
          </ol>
        </div>
        <button onClick={() => window.location.reload()} className="btn" style={{ width: "100%", background: "var(--brand)", padding: 12 }}>Check Again</button>
      </div>
    </div>
  );
}

function AuthGate() {
  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL;
  if (!isConfigured) return <MissingConfigScreen />;

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
