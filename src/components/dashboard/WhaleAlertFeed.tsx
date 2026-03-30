import { useState, useEffect } from "react";
import { fmtFiat } from "@/lib/cryptoState";

interface WhaleAlert {
  id: string; hash: string; from: string; to: string;
  amount: number; amount_usd: number; symbol: string;
  transaction_type: string; timestamp: number;
  blockchain: string;
}

// Since Whale Alert API requires a key for live data, we use an open proxy/scraper approach
// or show demo data with a link. We'll use the public Whale Alert RSS feed as fallback.
const DEMO_WHALES: WhaleAlert[] = [
  { id: "1", hash: "", from: "Binance", to: "Unknown", amount: 12500, amount_usd: 1_250_000_000, symbol: "BTC", transaction_type: "transfer", timestamp: Date.now() - 120000, blockchain: "bitcoin" },
  { id: "2", hash: "", from: "Unknown", to: "Coinbase", amount: 85000, amount_usd: 230_000_000, symbol: "ETH", transaction_type: "transfer", timestamp: Date.now() - 300000, blockchain: "ethereum" },
  { id: "3", hash: "", from: "Kraken", to: "Unknown", amount: 500_000_000, amount_usd: 500_000_000, symbol: "USDT", transaction_type: "transfer", timestamp: Date.now() - 600000, blockchain: "tron" },
  { id: "4", hash: "", from: "Unknown", to: "Binance", amount: 25_000_000, amount_usd: 25_000_000, symbol: "USDC", transaction_type: "transfer", timestamp: Date.now() - 900000, blockchain: "ethereum" },
  { id: "5", hash: "", from: "Unknown", to: "Unknown", amount: 3200, amount_usd: 320_000_000, symbol: "BTC", transaction_type: "transfer", timestamp: Date.now() - 1800000, blockchain: "bitcoin" },
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function WhaleAlertFeed() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>(DEMO_WHALES);
  const [loading] = useState(false);
  const [filter, setFilter] = useState("");

  const shown = filter
    ? alerts.filter(a => a.symbol.toUpperCase().includes(filter.toUpperCase()))
    : alerts;

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Whale Alert Feed</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input className="inp" placeholder="Filter by coin" style={{ width: 100, fontSize: 11, padding: "3px 8px" }}
            value={filter} onChange={e => setFilter(e.target.value)} />
          <a href="https://whale-alert.io" target="_blank" rel="noopener noreferrer"
            className="btn secondary" style={{ fontSize: 10, padding: "3px 8px", textDecoration: "none" }}>
            Live ↗
          </a>
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Loading...</div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {shown.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, background: "var(--brand3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{a.symbol.slice(0,4)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    <span className="mono">{a.amount_usd >= 1e9 ? (a.amount_usd / 1e9).toFixed(2) + "B" : "$" + fmtFiat(a.amount_usd)}</span>
                    {" "}<span className="muted">of {a.symbol}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.from} → {a.to}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted2)", flexShrink: 0 }}>{timeAgo(a.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="muted" style={{ fontSize: 10, padding: "6px 14px", borderTop: "1px solid var(--line)" }}>
          Demo data shown. Connect <a href="https://whale-alert.io/api" target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>Whale Alert API</a> for live feeds.
        </div>
      </div>
    </div>
  );
}
