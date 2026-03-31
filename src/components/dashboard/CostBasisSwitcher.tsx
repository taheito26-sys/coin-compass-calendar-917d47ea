import React, { useEffect, useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { compareCostMethods } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

export function CostBasisSwitcher() {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [comparison, setComparison] = useState<Record<string, { costBasis: number; realizedPnl: number }> | null>(null);
  const [loading, setLoading] = useState(false);

  const assets = portfolio?.positions || [];
  
  useEffect(() => {
    if (!selectedAsset && assets.length > 0) {
      setSelectedAsset(assets[0].assetId);
    }
  }, [assets]);

  useEffect(() => {
    if (!selectedAsset) return;
    
    async function fetchComparison() {
      setLoading(true);
      try {
        const data = await compareCostMethods(selectedAsset);
        setComparison(data);
      } catch (err) {
        console.error("Failed to fetch comparison:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchComparison();
  }, [selectedAsset]);

  if (assets.length === 0) {
    return <div className="muted" style={{ padding: 20, textAlign: "center" }}>No positions to compare.</div>;
  }

  const currentMethod = state.method || "FIFO";

  return (
    <div className="cost-basis-switcher">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <select 
          className="inp" 
          value={selectedAsset} 
          onChange={(e) => setSelectedAsset(e.target.value)}
          style={{ width: "auto", fontSize: 13, padding: "4px 8px" }}
        >
          {assets.map(a => (
            <option key={a.assetId} value={a.assetId}>{a.sym}</option>
          ))}
        </select>
        <span className="pill" style={{ opacity: 0.8 }}>Current: {currentMethod}</span>
      </div>

      {loading ? (
        <div className="muted" style={{ padding: "20px 0", textAlign: "center" }}>Comparing methods...</div>
      ) : comparison ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {["FIFO", "LIFO", "HIFO", "AVCO"].map((method) => {
            const data = comparison[method];
            if (!data) return null;
            const isActive = method === currentMethod;
            const diff = data.costBasis - comparison[currentMethod].costBasis;
            
            return (
              <div 
                key={method} 
                style={{ 
                  padding: 12, 
                  borderRadius: 10, 
                  background: isActive ? "var(--brand3)" : "rgba(255,255,255,0.03)",
                  border: isActive ? "1px solid var(--brand)" : "1px solid var(--line)",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: isActive ? "var(--brand)" : "var(--text)" }}>{method}</span>
                  {isActive && <span style={{ fontSize: 10, fontWeight: 900, background: "var(--brand)", color: "#fff", padding: "1px 6px", borderRadius: 4 }}>ACTIVE</span>}
                </div>
                
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>Unrealized Cost Basis</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(data.costBasis)}</div>
                
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span className="muted">Realized P&L</span>
                    <span style={{ color: data.realizedPnl >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
                      {data.realizedPnl >= 0 ? "+" : ""}{formatCurrency(data.realizedPnl)}
                    </span>
                  </div>
                  {!isActive && diff !== 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 4 }}>
                      <span className="muted" style={{ fontSize: 9 }}>Diff vs {currentMethod}</span>
                      <span style={{ color: diff < 0 ? "var(--good)" : "var(--bad)" }}>
                        {diff < 0 ? "Save " : "Pay +"}{formatCurrency(Math.abs(diff))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted2)", fontStyle: "italic", textAlign: "center" }}>
        Switch accounting methods in Settings to apply changes to the whole portfolio.
      </div>
    </div>
  );
}
