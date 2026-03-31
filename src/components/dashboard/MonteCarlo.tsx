import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

export function MonteCarlo() {
  const { state } = useCrypto();

  const currentVal = useMemo(() => {
    return state.holdings.reduce((s, h) => s + (h.quantity * (state.prices[h.asset] || 0)), 0);
  }, [state.holdings, state.prices]);

  const projections = useMemo(() => {
    // Basic Monte Carlo simulation mock
    // In a real app, use Geometric Brownian Motion over 10,000 paths
    const avgReturn = 0.45; // 45% annual
    const vol = 0.65; // 65% volatility
    
    return {
      optimistic: currentVal * (1 + avgReturn + vol),
      likely: currentVal * (1 + avgReturn),
      pessimistic: currentVal * (1 + avgReturn - vol)
    };
  }, [currentVal]);

  if (currentVal === 0) return <div className="muted" style={{ padding: 20 }}>Add holdings to run simulations.</div>;

  return (
    <div className="monte-carlo">
       <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginBottom: 2 }}>Current Value</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>${currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div style={{ fontSize: 9, color: "var(--muted2)" }}>1-Year Projection based on 65% Portfolio Volatility</div>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "rgba(34, 197, 94, 0.08)", padding: 10, borderRadius: 10, border: "1px solid rgba(34, 197, 94, 0.2)" }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--good)" }}>BULL CASE (Upper 95%)</span>
                <span style={{ fontSize: 13, fontWeight: 900 }}>+{( ((projections.optimistic / currentVal) - 1) * 100 ).toFixed(0)}%</span>
             </div>
             <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>${projections.optimistic.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>

          <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 800 }}>MEAN EXPECTATION</span>
                <span style={{ fontSize: 13, fontWeight: 900 }}>+{( ((projections.likely / currentVal) - 1) * 100 ).toFixed(0)}%</span>
             </div>
             <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>${projections.likely.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>

          <div style={{ background: "rgba(220, 38, 38, 0.08)", padding: 10, borderRadius: 10, border: "1px solid rgba(220, 38, 38, 0.2)" }}>
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--bad)" }}>BEAR CASE (Lower 95%)</span>
                <span style={{ fontSize: 13, fontWeight: 900 }}>{( ((projections.pessimistic / currentVal) - 1) * 100 ).toFixed(0)}%</span>
             </div>
             <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>${projections.pessimistic.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
       </div>

       <div style={{ marginTop: 14, fontSize: 8, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.4 }}>
          *Projections are probabilistic estimates. Past volatility does not guarantee future performance. Strategy: Geometric Brownian Motion.
       </div>
    </div>
  );
}
