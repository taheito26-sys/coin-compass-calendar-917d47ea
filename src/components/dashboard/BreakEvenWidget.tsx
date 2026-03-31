import React, { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";

export function BreakEvenWidget() {
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const underwater = useMemo(() => {
    return portfolio.positions.map(p => {
      const live = getPrice(p.sym);
      const price = live?.current_price ?? p.price ?? 0;
      const target = p.avg;
      const distancePct = price > 0 ? ((target - price) / price) * 100 : 0;
      const pnlAbs = (price - target) * p.qty;
      
      return { 
        sym: p.sym, 
        currentPrice: price, 
        target, 
        distancePct, 
        pnlAbs 
      };
    })
    .filter(x => x.pnlAbs < -1 && x.currentPrice > 0) // Only show ones in red > $1
    .sort((a, b) => a.pnlAbs - b.pnlAbs) // Most red first
    .slice(0, 3);
  }, [portfolio.positions, getPrice]);

  if (underwater.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>All Assets in Profit</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>No break-even targets found.</div>
      </div>
    );
  }

  return (
    <div className="break-even-widget">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {underwater.map(asset => (
          <div key={asset.sym} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="mono" style={{ fontWeight: 900, fontSize: 15 }}>{asset.sym}</span>
              <span style={{ fontSize: 10, color: "var(--bad)", fontWeight: 800, background: "rgba(239,68,68,0.1)", padding: "2px 6px", borderRadius: 4 }}>
                UNDERWATER
              </span>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Current Price</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>${fmtPx(asset.currentPrice)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Break-Even Price</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand)" }}>${fmtPx(asset.target)}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, height: 4, background: "var(--line)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
              {/* Progress to break-even? No, it's more like a distance indicator */}
              <div style={{ 
                position: "absolute", left: 0, top: 0, bottom: 0, background: "var(--bad)", 
                width: `${Math.min(100, Math.max(0, (asset.currentPrice / asset.target) * 100))}%` 
              }} />
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
              <span className="muted">Required Pump:</span>
              <span style={{ color: "var(--brand)", fontWeight: 800 }}>+{asset.distancePct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 10, color: "var(--muted2)", textAlign: "center" }}>
        Prioritize assets with small distances to reclaim break-even status.
      </div>
    </div>
  );
}
