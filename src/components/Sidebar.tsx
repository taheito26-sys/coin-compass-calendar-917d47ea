import { useCrypto } from "@/lib/cryptoContext";
import { useAdmin } from "@/hooks/useAdmin";

const pages = [
  { id: "dashboard", label: "Dashboard", sub: "Overview · KPIs", icon: "M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-11h7V4h-7v5Z" },
  { id: "assets", label: "Portfolio", sub: "Holdings · Lots", icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" },
  { id: "markets", label: "Markets", sub: "Prices · News", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { id: "ledger", label: "Ledger", sub: "Transactions · Import", icon: "M4 4h16v16H4zM4 9h16M9 4v16" },
  { id: "calendar", label: "Calendar", sub: "Daily P&L", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { id: "opportunities", label: "Opportunities", sub: "Listings · Airdrops", icon: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" },
  { id: "whale", label: "Whale Tracker", sub: "Live Movements", icon: "M2 12c2-4 6-7 10-7s8 3 10 7c-2 4-6 7-10 7s-8-3-10-7Z" },
  { id: "ai", label: "AI Analysis", sub: "Claude · Gemini", icon: "M12 2a4 4 0 0 0-4 4v1H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4Zm0 2a2 2 0 0 1 2 2v1h-4V6a2 2 0 0 1 2-2Zm-1 9v2h2v-2h2v-2h-2V9h-2v2H9v2h2Z" },
  { id: "settings", label: "Settings", sub: "Theme", icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L13 3h-4l-.9 2.9a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L4 13a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h4l.9-2.9a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6Z" },
];

export default function Sidebar({ page, onNav, onLogout }: { page: string; onNav: (p: string) => void; onLogout?: () => void }) {
  const { isAdmin } = useAdmin();

  const visiblePages = isAdmin
    ? [...pages, { id: "admin", label: "Admin", sub: "Users · Data", icon: "M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1Zm0 0h6v-1a6 6 0 0 0-9-5.197" }]
    : pages;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">
          <img src="/logo.png" alt="Tracker Logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover" }} />
        </div>
        <div>
          <div className="brand-name">Crypto Tracker Pro</div>
          <div className="brand-ver">v2 · Intelligence</div>
        </div>
      </div>
      <nav className="nav">
        {visiblePages.map(p => (
          <button key={p.id} className={`navBtn${page === p.id ? " active" : ""}`} onClick={() => onNav(p.id)}>
            <svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {p.label}
              </div>
              <small>{p.sub}</small>
            </div>
          </button>
        ))}
      </nav>
      {onLogout && (
        <div style={{ padding: "8px 12px", marginTop: "auto" }}>
          <button
            className="btn secondary"
            onClick={onLogout}
            style={{ width: "100%", fontSize: 11, padding: "6px 0" }}
          >
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
