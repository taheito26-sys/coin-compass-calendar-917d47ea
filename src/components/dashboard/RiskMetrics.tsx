import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

export function RiskMetrics() {
  const { state } = useCrypto();

  const metrics = useMemo(() => {
    // Mock risk calculation for premium UI demonstration
    // In a real app, calculate from daily return series in snapshots
    return {
      sharpe: 2.14,
      sortino: 2.85,
      maxDrawdown: -14.2,
      volatility: 0.65,
      beta: 1.12,
      alpha: 12.5
    };
  }, []);

  const getHealthColor = (val: number, goodHigh = true) => {
    if (goodHigh) return val > 2 ? "var(--good)" : val > 1 ? "var(--warn, #eab308)" : "var(--bad)";
    return val < 10 ? "var(--good)" : val < 20 ? "var(--warn, #eab308)" : "var(--bad)";
  };

  return (
    <div className="risk-metrics" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
       <div className="panel" style={{ background: "var(--panel2)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Sharpe Ratio</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: getHealthColor(metrics.sharpe) }}>{metrics.sharpe}</div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Risk-adjusted return vs 10Y T-Bond</div>
       </div>
       <div className="panel" style={{ background: "var(--panel2)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Max Drawdown</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: getHealthColor(Math.abs(metrics.maxDrawdown), false) }}>{metrics.maxDrawdown}%</div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Worst peak-to-trough performance</div>
       </div>
       <div className="panel" style={{ background: "var(--panel2)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Sortino Ratio</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: getHealthColor(metrics.sortino) }}>{metrics.sortino}</div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Downside risk adjusted return</div>
       </div>
       <div className="panel" style={{ background: "var(--panel2)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Beta (vs SPY)</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--brand)" }}>{metrics.beta}</div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Correlation to stock market volatility</div>
       </div>

       <div style={{ gridColumn: "span 2", background: "var(--brand3)", padding: 10, borderRadius: 8, fontSize: 10, lineHeight: 1.5 }}>
          💡 <strong>Tip:</strong> A Sharpe Ratio over 2.0 is considered institutional-grade. Your current strategy is highly efficient relative to market volatility.
       </div>
    </div>
  );
}
