import { useState, useRef, useEffect, useCallback } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useCrypto } from "@/lib/cryptoContext";

interface SearchResult {
  type: "coin" | "page" | "position";
  id: string;
  label: string;
  sub: string;
  icon?: string;
}

const PAGES = [
  { id: "dashboard", label: "Dashboard", sub: "KPIs · Allocation · Heatmap" },
  { id: "assets", label: "Assets", sub: "Positions · P&L · Lots" },
  { id: "ledger", label: "Ledger", sub: "Journal · Import · Manual Entry" },
  { id: "markets", label: "Markets", sub: "Live Prices · Bubbles" },
  { id: "settings", label: "Settings", sub: "Layout · Themes · Data" },
];

export default function GlobalSearch({ onNav }: { onNav: (page: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const { coins } = useLivePrices();
  const { state } = useCrypto();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Keyboard shortcut Cmd/Ctrl+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const results: SearchResult[] = (() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const out: SearchResult[] = [];

    // Pages
    for (const p of PAGES) {
      if (p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)) {
        out.push({ type: "page", id: p.id, label: p.label, sub: p.sub });
      }
    }

    // Portfolio positions
    const txSyms = new Set(state.txs.map(t => t.asset.toUpperCase()));
    for (const sym of txSyms) {
      if (sym.toLowerCase().includes(q)) {
        out.push({ type: "position", id: sym, label: sym, sub: "Your position" });
      }
    }

    // Coins
    const coinMatches = coins
      .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 8);
    for (const c of coinMatches) {
      if (!out.some(r => r.id === c.symbol.toUpperCase() && r.type === "position")) {
        out.push({
          type: "coin",
          id: c.id,
          label: `${c.symbol.toUpperCase()} · ${c.name}`,
          sub: `$${c.current_price?.toLocaleString()} · #${c.market_cap_rank}`,
        });
      }
    }

    return out.slice(0, 12);
  })();

  const handleSelect = (r: SearchResult) => {
    if (r.type === "page") onNav(r.id);
    else if (r.type === "position") onNav("assets");
    else onNav("markets");
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { handleSelect(results[selected]); }
  };

  return (
    <div className="searchBox" ref={wrapRef} style={{ position: "relative" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        placeholder="Search… ⌘K"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setSelected(0); }}
        onFocus={() => query && setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: "var(--lt-radius-sm, 8px)", zIndex: 999,
          maxHeight: 360, overflowY: "auto",
          boxShadow: "0 8px 30px rgba(0,0,0,.25)",
          marginTop: 4,
        }}>
          {results.map((r, i) => (
            <div
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 12,
                background: i === selected ? "var(--brand3)" : "transparent",
                borderBottom: "1px solid var(--line2)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{r.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{r.sub}</div>
              </div>
              <span className="pill" style={{ fontSize: 9 }}>
                {r.type === "page" ? "Page" : r.type === "position" ? "Position" : "Coin"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
