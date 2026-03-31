import React, { useState, useEffect } from "react";

export function NetworkStatus() {
  const networks = [
    { name: "Ethereum", gas: "12 Gwei", status: "Low", color: "var(--good)" },
    { name: "Solana", gas: "0.0001 SOL", status: "Nominal", color: "var(--good)" },
    { name: "Avalanche", gas: "25 nAVAX", status: "Moderate", color: "var(--warn, #eab308)" },
    { name: "Arbitrum", gas: "0.1 Gwei", status: "V. Low", color: "var(--good)" }
  ];

  const apiStatus = [
    { name: "Binance API", ping: "45ms", status: "Online", color: "var(--good)" },
    { name: "Kraken API", ping: "120ms", status: "Degraded", color: "var(--warn, #eab308)" },
    { name: "Coinbase API", ping: "32ms", status: "Online", color: "var(--good)" },
    { name: "OKX Sync", ping: "—", status: "Maintenance", color: "var(--bad)" }
  ];

  return (
    <div className="network-status" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
       <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>⛽ On-Chain Gas Fees</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
             {networks.map(n => (
               <div key={n.name} style={{ background: "var(--panel2)", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 800 }}>
                     <span>{n.name}</span>
                     <span style={{ color: n.color }}>{n.status}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{n.gas}</div>
               </div>
             ))}
          </div>
       </div>

       <div>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>🔌 External API Pulse</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
             {apiStatus.map(s => (
               <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                     <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                     <span style={{ fontWeight: 800 }}>{s.name}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                     <div style={{ fontWeight: 800 }}>{s.status}</div>
                     <div style={{ fontSize: 8, color: "var(--muted2)" }}>Ping: {s.ping}</div>
                  </div>
               </div>
             ))}
          </div>
       </div>

       <div style={{ background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 8, fontSize: 8, textAlign: "center", color: "var(--muted)" }}>
          Real-time health monitoring ensures reliable portfolio synchronization.
       </div>
    </div>
  );
}
