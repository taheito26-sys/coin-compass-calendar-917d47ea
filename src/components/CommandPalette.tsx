/**
 * CommandPalette — power-user ⌘K command interface
 * Inspired by TerminalCoin TUI + Linear/Raycast patterns
 * Replaces basic search with actions + navigation + search
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useCrypto } from "@/lib/cryptoContext";

type CmdType = "action" | "page" | "position" | "coin";

interface CmdItem {
  type: CmdType;
  id: string;
  label: string;
  sub: string;
  icon?: string;
  action?: () => void;
}

const PAGES: CmdItem[] = [
  { type: "page", id: "dashboard", label: "Dashboard", sub: "KPIs · Allocation · Heatmap", icon: "📊" },
  { type: "page", id: "assets", label: "Portfolio", sub: "Positions · P&L · Lots", icon: "💼" },
  { type: "page", id: "merchant", label: "Merchant", sub: "Deals · Collaboration · Approvals", icon: "🤝" },
  { type: "page", id: "markets", label: "Markets", sub: "Live Prices · Watchlist", icon: "🌐" },
  { type: "page", id: "ledger", label: "Ledger", sub: "Journal · Import · Manual Entry", icon: "📒" },
  { type: "page", id: "settings", label: "Settings", sub: "Layout · Themes · Vault", icon: "⚙️" },
];

export default function CommandPalette({ onNav }: { onNav: (page: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"search" | "actions">("search");
  const { coins } = useLivePrices();
  const { state, setState } = useCrypto();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setMode("search");
        setQuery("");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // Quick actions
  const quickActions: CmdItem[] = useMemo(() => [
    { type: "action", id: "new-tx", label: "Log Transaction", sub: "Open Ledger to add a new entry", icon: "➕",
      action: () => onNav("ledger") },
    { type: "action", id: "toggle-theme", label: "Toggle Dark/Light", sub: `Current: ${state.theme || "t1"}`, icon: "🌓",
      action: () => {
        const dark = ["t4", "t5"];
        const light = ["t1", "t2", "t3"];
        const current = state.theme || "t1";
        const next = dark.includes(current) ? "t1" : "t4";
        setState(s => ({ ...s, theme: next }));
      }},
    { type: "action", id: "export-data", label: "Export Portfolio Data", sub: "Navigate to Settings for backup", icon: "💾",
      action: () => onNav("settings") },
    { type: "action", id: "import-csv", label: "Import CSV", sub: "Upload exchange trade history", icon: "📁",
      action: () => onNav("ledger") },
  ], [state.theme, onNav, setState]);

  const results = useMemo(() => {
    if (!query.trim() && mode === "search") return [...quickActions.slice(0, 4), ...PAGES];
    
    const q = query.toLowerCase();
    const out: CmdItem[] = [];

    // Quick actions
    for (const a of quickActions) {
      if (a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q)) out.push(a);
    }

    // Pages
    for (const p of PAGES) {
      if (p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)) out.push(p);
    }

    // Portfolio positions
    const txSyms = new Set(state.txs.map(t => t.asset.toUpperCase()));
    for (const sym of txSyms) {
      if (sym.toLowerCase().includes(q)) {
        out.push({ type: "position", id: sym, label: sym, sub: "Your position", icon: "📌" });
      }
    }

    // Coins from CoinGecko
    const coinMatches = coins
      .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 6);
    for (const c of coinMatches) {
      if (!out.some(r => r.id === c.symbol.toUpperCase() && r.type === "position")) {
        out.push({
          type: "coin", id: c.id,
          label: `${c.symbol.toUpperCase()} · ${c.name}`,
          sub: `$${c.current_price?.toLocaleString()} · #${c.market_cap_rank}`,
          icon: "🪙",
        });
      }
    }

    return out.slice(0, 14);
  }, [query, mode, quickActions, state.txs, coins]);

  const handleSelect = useCallback((item: CmdItem) => {
    if (item.action) item.action();
    else if (item.type === "page") onNav(item.id);
    else if (item.type === "position") onNav("assets");
    else onNav("markets");
    setQuery("");
    setOpen(false);
  }, [onNav]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { handleSelect(results[selected]); }
    if (e.key === "Tab") { e.preventDefault(); setMode(m => m === "search" ? "actions" : "search"); }
  };

  const typeLabel = (t: CmdType) => {
    switch (t) {
      case "action": return "Action";
      case "page": return "Page";
      case "position": return "Position";
      case "coin": return "Coin";
    }
  };

  const typeColor = (t: CmdType) => {
    switch (t) {
      case "action": return "var(--brand)";
      case "page": return "var(--t5, #0ea5e9)";
      case "position": return "var(--good)";
      case "coin": return "var(--warn)";
    }
  };

  return (
    <div className="searchBox" ref={wrapRef} style={{ position: "relative" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        placeholder="Search or run command… ⌘K"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setSelected(0); }}
        onFocus={() => { setOpen(true); setSelected(0); }}
        onKeyDown={handleKeyDown}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: "var(--lt-radius-sm, 8px)", zIndex: 999,
          maxHeight: 420, overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,.3)",
          marginTop: 4, minWidth: 320,
        }}>
          {/* Hint */}
          <div style={{
            padding: "6px 12px", fontSize: 9, color: "var(--muted2)",
            borderBottom: "1px solid var(--line2)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>↑↓ Navigate · ↵ Select · Esc Close</span>
            <span>Tab to toggle mode</span>
          </div>
          
          {results.map((r, i) => (
            <div
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 12,
                background: i === selected ? "var(--brand3)" : "transparent",
                borderBottom: "1px solid var(--line2)",
                display: "flex", alignItems: "center", gap: 10,
                transition: "background .1s",
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>
                {r.icon || "•"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{r.sub}</div>
              </div>
              <span style={{
                fontSize: 8, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, textTransform: "uppercase",
                background: typeColor(r.type), color: "#fff",
                flexShrink: 0, letterSpacing: "0.5px",
              }}>
                {typeLabel(r.type)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
