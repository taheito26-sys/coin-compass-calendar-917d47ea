import { useCrypto } from "@/lib/cryptoContext";

const pages = [
  { id: "dashboard", label: "Dashboard", sub: "Overview · KPIs", icon: "M4 13h7V4H4v9Zm9 7h7V11h-7v9ZM4 20h7v-5H4v5Zm9-11h7V4h-7v5Z" },
  { id: "assets", label: "Portfolio", sub: "Holdings · Lots", icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" },
  
  { id: "markets", label: "Markets", sub: "Prices · News", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { id: "ledger", label: "Ledger", sub: "Transactions · Import", icon: "M4 4h16v16H4zM4 9h16M9 4v16" },
  { id: "calendar", label: "Calendar", sub: "Daily P&L", icon: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" },
  { id: "review", label: "Wrapped", sub: "2025 Review", icon: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" },
  { id: "settings", label: "Settings", sub: "Theme · Alerts", icon: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a7.9 7.9 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L13 3h-4l-.9 2.9a8 8 0 0 0-1.7 1l-2.4-1-2 3.5L4 13a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 21h4l.9-2.9a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6Z" },
];

export default function Sidebar({ page, onNav, onLogout }: { page: string; onNav: (p: string) => void; onLogout?: () => void }) {
  const { state } = useCrypto();
  const alertCount = (state.alerts || []).filter(a => a.active).length;

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
        {pages.map(p => (
          <button key={p.id} className={`navBtn${page === p.id ? " active" : ""}`} onClick={() => onNav(p.id)}>
            <svg viewBox="0 0 24 24" fill="none"><path d={p.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {p.label}
                {p.id === "settings" && alertCount > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 900, background: "var(--brand)", color: "#fff",
                    borderRadius: 999, padding: "1px 5px", lineHeight: 1.4,
                  }}>{alertCount}</span>
                )}
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
