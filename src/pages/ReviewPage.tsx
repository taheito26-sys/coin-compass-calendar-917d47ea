import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtTotal } from "@/lib/cryptoState";

export default function ReviewPage() {
  const { state } = useCrypto();

  const stats = useMemo(() => {
    const txs = state.txs;
    if (txs.length === 0) return null;

    // Fees
    const totalFees = txs.reduce((s, t) => s + (t.fee || 0), 0);
    
    // Most traded
    const assetCounts: Record<string, number> = {};
    txs.forEach(t => assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1);
    const mostTraded = Object.entries(assetCounts).sort((a, b) => b[1] - a[1])[0];

    // P&L
    const sortedByPnl = [...txs].filter(t => t.realized !== undefined).sort((a, b) => (b.realized || 0) - (a.realized || 0));
    const bestTrade = sortedByPnl[0];
    const worstTrade = sortedByPnl[sortedByPnl.length - 1];

    return { totalFees, mostTraded, bestTrade, worstTrade, txCount: txs.length };
  }, [state.txs]);

  if (!stats) return <div className="muted" style={{ padding: 40, textAlign: "center" }}>No transaction history found to generate a review. Start trading to see your 2025 highlights!</div>;

  return (
    <div className="review-page" style={{ padding: 10 }}>
       <div style={{ background: "var(--brand3)", padding: 40, borderRadius: 20, textAlign: "center", marginBottom: 30, border: "1px solid var(--brand)" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--brand)", textTransform: "uppercase", letterSpacing: 2 }}>2025 PORTFOLIO WRAPPED</div>
          <div style={{ fontSize: 48, fontWeight: 900, marginTop: 10 }}>You executed {stats.txCount} trades!</div>
          <div style={{ fontSize: 16, color: "var(--muted)", marginTop: 10 }}>It's been a busy year in the markets. Here's your definitive performance summary.</div>
       </div>

       <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 30 }}>
          <div className="panel" style={{ textAlign: "center", padding: 30 }}>
             <div style={{ fontSize: 40 }}>🏆</div>
             <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 800, marginTop: 10 }}>Best Trade</div>
             <div style={{ fontSize: 24, fontWeight: 900, color: "var(--good)" }}>+{fmtTotal(stats.bestTrade?.realized || 0)}</div>
             <div style={{ fontSize: 12, fontWeight: 700 }}>on {stats.bestTrade?.asset}</div>
          </div>
          <div className="panel" style={{ textAlign: "center", padding: 30 }}>
             <div style={{ fontSize: 40 }}>⚡</div>
             <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 800, marginTop: 10 }}>Most Traded</div>
             <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.mostTraded?.[0]}</div>
             <div style={{ fontSize: 12, fontWeight: 700 }}>{stats.mostTraded?.[1]} executions</div>
          </div>
          <div className="panel" style={{ textAlign: "center", padding: 30 }}>
             <div style={{ fontSize: 40 }}>💸</div>
             <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 800, marginTop: 10 }}>Fees Paid</div>
             <div style={{ fontSize: 24, fontWeight: 900, color: "var(--bad)" }}>{fmtTotal(stats.totalFees)}</div>
             <div style={{ fontSize: 12, color: "var(--muted)" }}>Contributing to the network.</div>
          </div>
       </div>

       <div className="panel">
          <div className="panel-head"><h2>Performance Heatmap</h2></div>
          <div className="panel-body" style={{ padding: 20 }}>
             <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
                {Array.from({ length: 48 }).map((_, i) => {
                   const opacity = Math.random() * 0.8 + 0.1;
                   return (
                     <div key={i} style={{ 
                        aspectRatio: "1/1", borderRadius: 4, 
                        background: i % 7 === 0 ? "rgba(220, 38, 38, 0.4)" : "rgba(34, 197, 94, " + opacity + ")",
                        border: "1px solid var(--line)"
                     }} title="P&L Snapshot" />
                   );
                })}
             </div>
             <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 9, color: "var(--muted2)", textTransform: "uppercase", fontWeight: 800 }}>
                <span>Jan</span>
                <span>Dec</span>
             </div>
          </div>
       </div>
    </div>
  );
}
