import { useState, useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";

export default function RebalancePage() {
  const { positions, totalMV } = useUnifiedPortfolio();
  const [targets, setTargets] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    return positions
      .filter(p => p.mv !== null && (p.mv ?? 0) > 0)
      .map(p => {
        const current = totalMV > 0 ? ((p.mv ?? 0) / totalMV) * 100 : 0;
        const targetStr = targets[p.sym] ?? "";
        const target = parseFloat(targetStr);
        const targetValid = Number.isFinite(target) && target >= 0;
        const targetMV = targetValid ? (target / 100) * totalMV : null;
        const diff = targetMV !== null && p.price != null ? targetMV - (p.mv ?? 0) : null;
        const diffQty = diff !== null && p.price != null && p.price > 0 ? diff / p.price : null;
        return { ...p, current, target: targetValid ? target : null, targetMV, diff, diffQty };
      });
  }, [positions, totalMV, targets]);

  const totalTarget = Object.values(targets).reduce((s, v) => {
    const n = parseFloat(v); return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const targetOk = Math.abs(totalTarget - 100) < 0.01 || totalTarget === 0;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Portfolio Rebalancer</h2>
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
          Set target allocations (%) and see exactly what to buy/sell to rebalance.
          Targets must sum to 100%.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Target Allocations</span>
          <span className={`mono ${targetOk ? "good" : "bad"}`} style={{ fontSize: 12 }}>
            Sum: {totalTarget.toFixed(1)}% {!targetOk && totalTarget > 0 && "(must equal 100%)"}
          </span>
        </div>
        <div className="panel-body">
          <div className="tableWrap">
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Current Value</th>
                  <th>Current %</th>
                  <th>Target %</th>
                  <th>Target Value</th>
                  <th>Action</th>
                  <th>Qty to Trade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.sym}>
                    <td><span style={{ fontWeight: 700 }}>{r.sym}</span></td>
                    <td className="mono">${fmtFiat(r.mv ?? 0)}</td>
                    <td className="mono">{r.current.toFixed(2)}%</td>
                    <td>
                      <input
                        className="inp"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder={r.current.toFixed(1)}
                        value={targets[r.sym] ?? ""}
                        onChange={e => setTargets(prev => ({ ...prev, [r.sym]: e.target.value }))}
                        style={{ width: 80, textAlign: "right" }}
                      />
                    </td>
                    <td className="mono">{r.targetMV != null ? "$" + fmtFiat(r.targetMV) : "—"}</td>
                    <td>
                      {r.diff != null ? (
                        <span className={r.diff > 50 ? "good" : r.diff < -50 ? "bad" : "muted"}
                          style={{ fontWeight: 600, fontSize: 12 }}>
                          {r.diff > 50 ? "▲ BUY" : r.diff < -50 ? "▼ SELL" : "≈ HOLD"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="mono">
                      {r.diffQty != null && Math.abs(r.diffQty) > 1e-8 ? (
                        <span className={r.diffQty > 0 ? "good" : "bad"}>
                          {r.diffQty > 0 ? "+" : ""}{fmtQty(r.diffQty)} {r.sym}
                        </span>
                      ) : r.diff != null ? "~" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn secondary"
            style={{ marginTop: 12, fontSize: 11 }}
            onClick={() => setTargets(Object.fromEntries(rows.map(r => [r.sym, r.current.toFixed(1)])))}
          >
            Auto-fill current allocations
          </button>
        </div>
      </div>
    </div>
  );
}
