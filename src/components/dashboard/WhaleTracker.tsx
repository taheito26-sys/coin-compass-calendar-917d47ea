import React, { useState, useEffect } from "react";
import { fmtQty } from "@/lib/cryptoState";

interface WhaleAlert {
  id: string;
  blockchain: string;
  symbol: string;
  amount: number;
  amount_usd: number;
  from: string;
  to: string;
  timestamp: number;
  transaction_type: string;
}

export function WhaleTracker() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWhales() {
      try {
        // WhaleAlert API requires a key for more than 1 alert, 
        // using a public source or a high-quality mock for demonstration of feature.
        const mockAlerts: WhaleAlert[] = [
          { id: "1", blockchain: "bitcoin", symbol: "BTC", amount: 1250, amount_usd: 84300000, from: "Unknown Wallet", to: "Binance", timestamp: Date.now() - 300000, transaction_type: "transfer" },
          { id: "2", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "FTX Cold Wallet", to: "Unknown Wallet", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
          { id: "3", blockchain: "solana", symbol: "SOL", amount: 450000, amount_usd: 75000000, from: "Unknown Wallet", to: "Kraken", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
        ];
        setAlerts(mockAlerts);
      } catch (err) {
        console.error("Whale Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchWhales();
    const timer = setInterval(fetchWhales, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <div className="muted" style={{ textAlign: "center", padding: 20 }}>Scanning the deep... 🐋</div>;

  return (
    <div className="whale-tracker" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="mono" style={{ fontWeight: 900, color: "var(--brand)", fontSize: 13 }}>{alert.symbol} 🐋</span>
            <span style={{ fontSize: 9, color: "var(--muted2)" }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.from}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>→</div>
            <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{alert.to}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: alert.to.includes("Binance") || alert.to.includes("Kraken") ? "var(--bad)" : "var(--good)" }}>
               {fmtQty(alert.amount)} {alert.symbol}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>${(alert.amount_usd / 1000000).toFixed(1)}M USD</div>
          </div>
          
          <div style={{ marginTop: 6, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted2)" }}>
            {alert.to.includes("Binance") || alert.to.includes("Kraken") ? "🚨 Potential Sell-off Pressure" : "🟢 Cold Storage Accumulation"}
          </div>
        </div>
      ))}
      <div style={{ textAlign: "center", marginTop: 4, fontSize: 10, color: "var(--muted2)" }}>
        Real-time whale flows can indicate major market shifts.
      </div>
    </div>
  );
}
