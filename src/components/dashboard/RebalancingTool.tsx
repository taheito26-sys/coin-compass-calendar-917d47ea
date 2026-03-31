import React, { useState } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { formatCurrency } from "@/lib/utils";

export default function RebalancingTool() {
  const portfolio = useUnifiedPortfolio();
  const [targets, setTargets] = useState<Record<string, number>>({});

  const totalMV = portfolio.totalMV;
  const positions = portfolio.positions.sort((a, b) => (b.mv || 0) - (a.mv || 0));

  const handleTargetChange = (sym: string, val: string) => {
    const num = parseFloat(val) || 0;
    setTargets(prev => ({ ...prev, [sym]: num }));
  };

  const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0);

  return (
    <div className="rebalancing-tool">
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Target Total: <span style={{ color: totalTarget > 100 ? "var(--bad)" : (totalTarget === 100 ? "var(--good)" : "var(--text)"), fontWeight: 800 }}>{totalTarget.toFixed(1)}%</span>
        </div>
        {totalTarget !== 100 && totalTarget > 0 && (
          <div style={{ fontSize: 10, color: "var(--bad)" }}>Targets must sum to 100%</div>
        )}
      </div>

      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        <table style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={{ padding: "4px 0" }}>Asset</th>
              <th>Actual %</th>
              <th>Target %</th>
              <th style={{ textAlign: "right" }}>Drift</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => {
              const sym = p.sym;
              const actualPct = totalMV > 0 ? ((p.mv || 0) / totalMV) * 100 : 0;
              const targetPct = targets[sym] || 0;
              const drift = actualPct - targetPct;
              
              // To hit target, we need (TotalMV * targetPct / 100)
              const targetUSD = (totalMV * targetPct) / 100;
              const actionUSD = (p.mv || 0) - targetUSD;
              
              return (
                <tr key={sym} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "10px 0", fontWeight: 700 }}>{sym}</td>
                  <td>{actualPct.toFixed(1)}%</td>
                  <td>
                    <input 
                      type="number" 
                      className="inp" 
                      value={targets[sym] ?? ""} 
                      onChange={(e) => handleTargetChange(sym, e.target.value)}
                      placeholder="0"
                      style={{ width: 50, padding: "2px 4px", fontSize: 11 }}
                    />
                  </td>
                  <td style={{ textAlign: "right", color: Math.abs(drift) > 5 ? "var(--bad)" : "inherit" }}>
                    {drift > 0 ? "+" : ""}{drift.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: actionUSD > 0 ? "var(--bad)" : "var(--good)" }}>
                    {targetPct > 0 ? (
                      actionUSD > 0 ? `Sell ${formatCurrency(actionUSD)}` : `Buy ${formatCurrency(Math.abs(actionUSD))}`
                    ) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px dashed var(--line)" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
          <b>Tip:</b> Enter your ideal allocation percentages. The tool calculates how much you need to buy or sell to Rebalance your portfolio back to your target weights.
        </div>
      </div>
    </div>
  );
}
