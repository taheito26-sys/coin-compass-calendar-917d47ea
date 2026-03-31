import React, { useState, useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { fmtTotal, fmtPx } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";

export function WhatIfSimulator() {
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});

  const topAssets = useMemo(() => {
    return [...portfolio.positions]
      .sort((a,b) => (b.mv || 0) - (a.mv || 0))
      .slice(0, 3);
  }, [portfolio.positions]);

  const handleMultChange = (sym: string, val: string) => {
    setMultipliers(prev => ({ ...prev, [sym]: parseFloat(val) || 1 }));
  };

  const newTotal = useMemo(() => {
    let sum = 0;
    portfolio.positions.forEach(p => {
      const live = getPrice(p.sym);
      const price = live?.current_price ?? p.price ?? 0;
      const mult = multipliers[p.sym] || 1;
      sum += (price * mult) * p.qty;
    });
    return sum;
  }, [portfolio.positions, getPrice, multipliers]);

  const diff = newTotal - portfolio.totalMV;
  const isPositive = diff >= 0;

  return (
    <div className="what-if-simulator" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 10, border: "1px dashed var(--line)", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Projected Value</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: isPositive ? "var(--good)" : "var(--bad)" }}>
          {fmtTotal(newTotal)}
        </div>
        <div style={{ fontSize: 11, color: isPositive ? "var(--good)" : "var(--bad)", fontWeight: 800 }}>
          {isPositive ? "+" : ""}{fmtTotal(diff)} ({((diff / portfolio.totalMV) * 100 || 0).toFixed(1)}%)
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {topAssets.map(asset => {
          const mult = multipliers[asset.sym] || 1;
          const live = getPrice(asset.sym);
          const price = live?.current_price ?? asset.price ?? 0;
          return (
            <div key={asset.sym} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span className="mono" style={{ fontWeight: 800 }}>{asset.sym} @ ${(price * mult).toLocaleString()}</span>
                <span className="muted">{mult.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0" max="5" step="0.1" 
                value={mult} onChange={(e) => handleMultChange(asset.sym, e.target.value)}
                style={{ appearance: "none", background: "var(--line)", height: 4, borderRadius: 2, accentColor: "var(--brand)" }}
              />
            </div>
          );
        })}
      </div>
      
      <div style={{ fontSize: 10, color: "var(--muted2)", textAlign: "center" }}>
         Simulation affects only the visual projection. No actual data is changed.
      </div>
    </div>
  );
}
