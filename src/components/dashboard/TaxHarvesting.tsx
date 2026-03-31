import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";

export function TaxHarvesting() {
  const { state } = useCrypto();

  const harvestCandidates = useMemo(() => {
    return state.holdings
      .map(h => {
        const currentPrice = state.prices[h.asset] || 0;
        const avgCost = h.buyPrice;
        const lossPerUnit = avgCost - currentPrice;
        const totalLoss = lossPerUnit * h.quantity;
        return {
          asset: h.asset,
          quantity: h.quantity,
          avgCost,
          currentPrice,
          totalLoss,
          pctLoss: (lossPerUnit / avgCost) * 100
        };
      })
      .filter(h => h.totalLoss > 0)
      .sort((a, b) => b.totalLoss - a.totalLoss);
  }, [state.holdings, state.prices]);

  const totalPossibleHarvest = useMemo(() => {
    return harvestCandidates.reduce((s, h) => s + h.totalLoss, 0);
  }, [harvestCandidates]);

  if (harvestCandidates.length === 0) return <div className="muted" style={{ padding: 20 }}>No tax-loss harvesting candidates found. All assets are currently in profit.</div>;

  return (
    <div className="tax-harvesting">
       <div style={{ background: "rgba(220, 38, 38, 0.08)", padding: 12, borderRadius: 12, border: "1px solid rgba(220, 38, 38, 0.2)", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Global Potential Harvest</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--bad)" }}>{fmtFiat(totalPossibleHarvest, state.base)}</div>
          <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>Selling these losers could offset your taxable gains elsewhere.</div>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {harvestCandidates.map(c => (
            <div key={c.asset} style={{ background: "var(--panel2)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{c.asset} <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>{fmtQty(c.quantity)} units</span></span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--bad)" }}>-{c.pctLoss.toFixed(1)}%</span>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "baseline" }}>
                  <div style={{ fontSize: 9 }}>
                     <div className="muted">Avg Cost: ${c.avgCost.toFixed(2)}</div>
                     <div className="muted">Current: ${c.currentPrice.toFixed(2)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                     <div style={{ fontSize: 14, fontWeight: 900, color: "var(--bad)" }}>{fmtFiat(c.totalLoss, state.base)}</div>
                     <div style={{ fontSize: 8, color: "var(--muted2)", textTransform: "uppercase" }}>Harvestable Loss</div>
                  </div>
               </div>
            </div>
          ))}
       </div>

       <div style={{ marginTop: 14, background: "rgba(255, 255, 255, 0.03)", padding: 10, borderRadius: 8, fontSize: 10, lineHeight: 1.5 }}>
          ⚠️ <strong>Wash Sale Rule:</strong> Be careful of the 30-day rebuy window (depending on jurisdiction) which could invalidate these tax offsets.
       </div>
    </div>
  );
}
