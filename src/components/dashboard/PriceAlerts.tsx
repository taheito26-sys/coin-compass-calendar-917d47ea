import React, { useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtPx } from "@/lib/cryptoState";
import { toast } from "sonner";

export function PriceAlerts() {
  const { state } = useCrypto();
  const [asset, setAsset] = useState("BTC");
  const [price, setPrice] = useState(0);
  const [alerts, setAlerts] = useState<any[]>([
    { id: "1", asset: "BTC", threshold: 75000, type: "above", active: true },
    { id: "2", asset: "ETH", threshold: 2500, type: "below", active: false }
  ]);

  const addAlert = () => {
    if (price <= 0) return;
    const newAlert = {
      id: Date.now().toString(),
      asset,
      threshold: price,
      type: price > (state.prices[asset] || 0) ? "above" : "below",
      active: true
    };
    setAlerts([...alerts, newAlert]);
    toast.success(`Alert set for ${asset} at ${fmtPx(price)}`);
    setPrice(0);
  };

  const removeAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
    toast.success("Alert removed.");
  };

  const toggleAlert = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, active: !a.active } : a));
  };

  return (
    <div className="price-alerts">
       <div className="panel" style={{ background: "var(--panel2)", border: "1px dashed var(--line)", padding: 12, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
             <select className="inp" value={asset} onChange={e => setAsset(e.target.value)} style={{ fontSize: 11 }}>
                {Object.keys(state.prices).slice(0, 10).map(s => <option key={s} value={s}>{s}</option>)}
             </select>
             <input 
               className="inp" type="number" placeholder="Target Price..."
               value={price || ""} onChange={e => setPrice(Number(e.target.value))}
               style={{ fontSize: 11, padding: "4px 8px" }} 
             />
             <button className="btn primary tiny" onClick={addAlert} disabled={!price}>Create</button>
          </div>
       </div>

       <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.length > 0 ? alerts.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--panel2)", borderRadius: 10, border: "1px solid var(--line)", opacity: a.active ? 1 : 0.4 }}>
               <div>
                  <div style={{ fontSize: 11, fontWeight: 800 }}>{a.asset} {a.type === "above" ? "▲" : "▼"} ${a.threshold.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 2 }}>Current: ${ (state.prices[a.asset] || 0).toLocaleString() }</div>
               </div>
               <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    className={`btn tiny ${a.active ? "secondary" : "primary"}`} 
                    onClick={() => toggleAlert(a.id)}
                    style={{ fontSize: 8 }}
                  >
                    {a.active ? "Pause" : "Resume"}
                  </button>
                  <button className="btn tiny secondary" onClick={() => removeAlert(a.id)} style={{ fontSize: 8, color: "var(--bad)" }}>✕</button>
               </div>
            </div>
          )) : <div className="muted" style={{ padding: 20, textAlign: "center" }}>No active alerts set.</div>}
       </div>

       <div style={{ marginTop: 14, background: "rgba(255, 255, 255, 0.03)", padding: 10, borderRadius: 8, fontSize: 10, textAlign: "center", color: "var(--muted)" }}>
          Real-time price alerts help you stay ahead of the market.
       </div>
    </div>
  );
}
