import { useMemo } from "react";

export default function TrendingSectors() {
  const sectors = useMemo(() => [
    { name: "Liquid Staking", change: 0.71, topCoin: "RPL", topCoinChange: 3.11, color: "var(--brand)" },
    { name: "FTX Bankruptcy Estate", change: -0.35, topCoin: "FTT", topCoinChange: 1.14, color: "#f97316" },
    { name: "DeFi", change: -0.43, topCoin: "RPL", topCoinChange: 3.11, color: "#3b82f6" },
    { name: "Exchange-based Tokens", change: -0.71, topCoin: "FTT", topCoinChange: 1.14, color: "#ec4899" },
  ], []);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Trending Sectors</h2>
        <span className="pill">24H Performance</span>
      </div>
      <div className="panel-body" style={{ padding: "8px 0" }}>
        {sectors.map((s, i) => (
          <div key={i} style={{ 
            display: "flex", alignItems: "center", justifyContent: "space-between", 
            padding: "12px 16px", borderBottom: i < sectors.length - 1 ? "1px solid var(--line)" : "none",
            transition: "background 0.2s", cursor: "default"
          }}
          className="hover-bright"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{s.name}</div>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ 
                fontSize: 12, fontWeight: 800, 
                color: s.change >= 0 ? "var(--good)" : "var(--bad)",
                width: 60, textAlign: "right"
              }}>
                {(s.change >= 0 ? "+" : "") + s.change.toFixed(2)}%
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: 80 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: "var(--muted)", letterSpacing: "0.05em" }}>{s.topCoin}</span>
                <span style={{ 
                  fontSize: 10, fontWeight: 900, 
                  color: s.topCoinChange >= 0 ? "var(--good)" : "var(--bad)"
                }}>
                  {(s.topCoinChange >= 0 ? "+" : "") + s.topCoinChange.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
