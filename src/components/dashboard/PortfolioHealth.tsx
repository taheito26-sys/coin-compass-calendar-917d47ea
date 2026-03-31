import React, { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

export function PortfolioHealth() {
  const portfolio = useUnifiedPortfolio();
  
  const score = useMemo(() => {
    if (portfolio.totalMV === 0) return 0;
    
    let base = 100;
    
    // 1. Diversification (0-30 points)
    const count = portfolio.positions.length;
    const divScore = Math.min(30, count * 3);
    
    // 2. Concentration Penalty (0-30 points)
    const topAsset = portfolio.positions.sort((a,b) => (b.mv || 0) - (a.mv || 0))[0];
    const topPct = topAsset ? ((topAsset.mv || 0) / portfolio.totalMV) * 100 : 0;
    const concScore = Math.max(0, 30 - (topPct > 40 ? (topPct - 40) : 0));
    
    // 3. Risk (Unrealized P&L) (0-40 points)
    const pnlPct = portfolio.totalPnlPct;
    const pnlScore = Math.min(40, Math.max(0, 20 + pnlPct / 2));
    
    return Math.round(divScore + concScore + pnlScore);
  }, [portfolio.positions, portfolio.totalMV, portfolio.totalPnlPct]);

  const getColor = (s: number) => {
    if (s > 80) return "var(--good)";
    if (s > 60) return "var(--brand)";
    if (s > 40) return "var(--warning, #eab308)";
    return "var(--bad)";
  };

  const getLabel = (s: number) => {
    if (s > 80) return "Excellent";
    if (s > 60) return "Healthy";
    if (s > 40) return "Fair";
    return "High Risk";
  };

  return (
    <div style={{ textAlign: "center", padding: "10px 0" }}>
      <div style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
        <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle 
            cx="50" cy="50" r="45" fill="none" stroke={getColor(score)} strokeWidth="8"
            strokeDasharray={`${(score / 100) * 283} 283`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: getColor(score) }}>{score}</div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>Health Score</div>
        </div>
      </div>
      
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{getLabel(score)}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          {score > 70 ? "Your portfolio is well balanced." : "Consider diversifying your top holdings."}
        </div>
      </div>
    </div>
  );
}
