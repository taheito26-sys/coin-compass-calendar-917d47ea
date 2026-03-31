import React, { useState, useEffect } from "react";

export function NewlyListed() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNew() {
      try {
        // CoinGecko /coins/list has many tokens, using a targeted mock for "High Interest" new listings
        const mockNew = [
          { name: "Nebula AI", symbol: "NBAI", added: "2h ago", gain: 45.2 },
          { name: "Solana Kitty", symbol: "SKTY", added: "5h ago", gain: -12.5 },
          { name: "Mars Protocol", symbol: "MARS", added: "12h ago", gain: 8.4 },
          { name: "Layer Z", symbol: "LZ", added: "1d ago", gain: 112.5 }
        ];
        setTokens(mockNew);
      } catch (err) {
        console.error("New Listing Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchNew();
  }, []);

  if (loading) return <div className="muted" style={{ padding: 20 }}>Scanning the frontier...</div>;

  return (
    <div className="newly-listed" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
       {tokens.map(t => (
         <div key={t.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--panel2)", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div>
               <div style={{ fontSize: 12, fontWeight: 800 }}>{t.name} <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>({t.symbol})</span></div>
               <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 2 }}>Listed {t.added}</div>
            </div>
            <div style={{ textAlign: "right" }}>
               <div style={{ fontSize: 13, fontWeight: 900, color: t.gain > 0 ? "var(--good)" : "var(--bad)" }}>
                  {t.gain > 0 ? "+" : ""}{t.gain}%
               </div>
               <button className="btn tiny secondary" style={{ fontSize: 8, marginTop: 4, height: 16, padding: "0 6px" }}>Watch</button>
            </div>
         </div>
       ))}
    </div>
  );
}

export function TrendingSectors() {
  const sectors = [
    { name: "Artificial Intelligence", trend: 15.4, tokens: "RNDR, NEAR, FET" },
    { name: "De-Fi 2.0", trend: -2.1, tokens: "UNI, AAVE, MKR" },
    { name: "Meme Coins", trend: 42.8, tokens: "PEPE, SHIB, DOGE" },
    { name: "Layer 1 / Layer 2", trend: 4.5, tokens: "SOL, ETH, ARB" },
    { name: "RWA / Oracle", trend: 1.2, tokens: "LINK, PYTH, ONDO" }
  ].sort((a, b) => b.trend - a.trend);

  return (
    <div className="trending-sectors" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
       {sectors.map(s => (
         <div key={s.name}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
               <span style={{ fontSize: 11, fontWeight: 800 }}>{s.name}</span>
               <span style={{ fontSize: 11, fontWeight: 800, color: s.trend > 0 ? "var(--good)" : "var(--bad)" }}>
                  {s.trend > 0 ? "+" : ""}{s.trend}%
               </span>
            </div>
            <div style={{ height: 4, background: "var(--panel3)", borderRadius: 2, overflow: "hidden" }}>
               <div style={{ height: "100%", width: `${Math.min(100, Math.abs(s.trend) * 2)}%`, background: s.trend > 0 ? "var(--good)" : "var(--bad)", borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Featured: {s.tokens}</div>
         </div>
       ))}
    </div>
  );
}
