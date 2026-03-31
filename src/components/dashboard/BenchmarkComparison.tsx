import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

export function BenchmarkComparison() {
  const { state } = useCrypto();

  const currentPnlPct = useMemo(() => {
    const cost = state.holdings.reduce((s, h) => s + (h.quantity * h.buyPrice), 0);
    const value = state.holdings.reduce((s, h) => s + (h.quantity * (state.prices[h.asset] || 0)), 0);
    if (cost === 0) return 0;
    return ((value / cost) - 1) * 100;
  }, [state.holdings, state.prices]);

  const benchmarks = [
    { name: "Bitcoin (BTC)", perf: 32.4, color: "#f7931a" },
    { name: "Ethereum (ETH)", perf: 18.2, color: "#627eea" },
    { name: "S&P 500 (SPY)", perf: 8.5, color: "var(--brand)" },
    { name: "Nasdaq 100 (QQQ)", perf: 12.1, color: "var(--brand2)" }
  ];

  return (
    <div className="benchmark-comparison">
       <div style={{ background: "var(--panel2)", padding: 12, borderRadius: 12, border: "1px solid var(--line)", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Your Portfolio Alpha</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: currentPnlPct > 32.4 ? "var(--good)" : "var(--warn, #eab308)" }}>
             {currentPnlPct > 0 ? "+" : ""}{currentPnlPct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>
             {currentPnlPct > 32.4 ? "🎉 You are beating Bitcoin!" : "💪 BTC is currently outperforming your mix."}
          </div>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {benchmarks.map(b => {
             const alpha = currentPnlPct - b.perf;
             return (
               <div key={b.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                     <span style={{ fontWeight: 800 }}>{b.name}</span>
                     <span style={{ fontWeight: 800, color: alpha > 0 ? "var(--good)" : "var(--bad)" }}>
                        {alpha > 0 ? "+" : ""}{alpha.toFixed(1)}% Alpha
                     </span>
                  </div>
                  <div style={{ height: 6, background: "var(--panel3)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                     <div style={{ 
                        position: "absolute", left: 0, top: 0, height: "100%", 
                        width: `${Math.min(100, Math.max(5, (b.perf / 40) * 100))}%`, 
                        background: b.color, borderRadius: 3 
                     }} />
                     {/* Marker for current portfolio */}
                     <div style={{ 
                        position: "absolute", left: `${Math.min(100, Math.max(5, (currentPnlPct / 40) * 100))}%`, 
                        top: -2, height: 10, width: 2, background: "#fff", zIndex: 10,
                        boxShadow: "0 0 4px #000"
                     }} />
                  </div>
               </div>
             );
          })}
       </div>

       <div style={{ marginTop: 14, fontSize: 8, color: "var(--muted2)", lineHeight: 1.4 }}>
          Comparison based on Year-to-Date (YTD) performance. Alpha represents excess returns relative to the benchmark.
       </div>
    </div>
  );
}
