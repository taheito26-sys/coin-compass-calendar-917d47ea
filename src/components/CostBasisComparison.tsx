import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { compareAllMethods } from "@/lib/costBasisSwitcher";
import { fmtFiat } from "@/lib/cryptoState";

export default function CostBasisComparison({ onClose }: { onClose: () => void }) {
  const { state } = useCrypto();
  const getPrice = usePortfolioPriceGetter();
  const results = useMemo(() => compareAllMethods(state.txs, getPrice), [state.txs, getPrice]);

  return (
    <div className="modalBg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, width: "95vw" }} onClick={e => e.stopPropagation()}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Cost Basis Method Comparison</span>
          <button className="btn secondary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={onClose}>Close</button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Same transactions, different accounting methods. Use this to choose the most tax-efficient method.
          </p>
          <div className="tableWrap">
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Portfolio Value</th>
                  <th>Cost Basis</th>
                  <th>Unrealized P&amp;L</th>
                  <th>Realized P&amp;L</th>
                  <th>Total P&amp;L</th>
                  <th>Total P&amp;L %</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.method}>
                    <td><span style={{ fontWeight: 700, fontSize: 13 }}>{r.method}</span></td>
                    <td className="mono">${fmtFiat(r.totalMV)}</td>
                    <td className="mono">${fmtFiat(r.totalCost)}</td>
                    <td className={r.unrealizedPnl >= 0 ? "good mono" : "bad mono"}>{r.unrealizedPnl >= 0 ? "+" : ""}${fmtFiat(r.unrealizedPnl)}</td>
                    <td className={r.realizedPnl >= 0 ? "good mono" : "bad mono"}>{r.realizedPnl >= 0 ? "+" : ""}${fmtFiat(r.realizedPnl)}</td>
                    <td className={r.totalPnl >= 0 ? "good mono" : "bad mono"}>{r.totalPnl >= 0 ? "+" : ""}${fmtFiat(r.totalPnl)}</td>
                    <td className={r.totalPnlPct >= 0 ? "good mono" : "bad mono"}>{r.totalPnlPct >= 0 ? "+" : ""}{r.totalPnlPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
