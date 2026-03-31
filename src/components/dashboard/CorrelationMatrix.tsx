import React, { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";

export function CorrelationMatrix() {
  const { state } = useCrypto();
  
  const topCoins = useMemo(() => {
    return state.holdings.slice(0, 5).map(h => h.asset);
  }, [state.holdings]);

  if (topCoins.length < 2) return <div className="muted" style={{ padding: 20 }}>Add more assets to see correlations.</div>;

  // Mock correlation values for demonstration
  // In a real app, calculate from historical price returns
  const getCor = (a: string, b: string) => {
    if (a === b) return 1.0;
    // Semantically logical mocks
    if (a === "BTC" && b === "ETH") return 0.88;
    if (a === "BTC" && b === "SOL") return 0.72;
    if (a === "USDT" || b === "USDT") return 0.05;
    return (Math.random() * 0.5 + 0.3).toFixed(2);
  };

  const getColor = (val: number) => {
    if (val > 0.8) return "rgba(34, 197, 94, 0.4)";
    if (val > 0.5) return "rgba(34, 197, 94, 0.2)";
    if (val < 0.2) return "rgba(220, 38, 38, 0.1)";
    return "rgba(255, 255, 255, 0.03)";
  };

  return (
    <div className="correlation-matrix" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "4px" }}>
        <thead>
          <tr>
            <th style={{ background: "transparent", border: "none" }}></th>
            {topCoins.map(c => <th key={c} style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {topCoins.map(row => (
            <tr key={row}>
              <th style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textAlign: "left" }}>{row}</th>
              {topCoins.map(col => {
                const val = Number(getCor(row, col));
                return (
                  <td 
                    key={col} 
                    style={{ 
                      background: row === col ? "var(--brand)" : getColor(val),
                      borderRadius: 4, textAlign: "center", padding: "8px 0",
                      fontSize: 10, fontWeight: 800, color: row === col ? "#fff" : "inherit",
                      border: "1px solid var(--line)"
                    }}
                  >
                    {val.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
         <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
           <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(34, 197, 94, 0.4)" }} />
             <span style={{ fontSize: 8, color: "var(--muted2)" }}>High</span>
           </div>
           <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
             <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(220, 38, 38, 0.1)" }} />
             <span style={{ fontSize: 8, color: "var(--muted2)" }}>Low</span>
           </div>
         </div>
         <div style={{ fontSize: 8, color: "var(--muted2)", fontStyle: "italic" }}>
           Based on 30D daily returns
         </div>
      </div>
    </div>
  );
}
