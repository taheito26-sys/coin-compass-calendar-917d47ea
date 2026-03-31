import React, { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtPx, fmtFiat } from "@/lib/cryptoState";
import { toast } from "sonner";

export default function PlannerPage() {
  const { state } = useCrypto();
  const [asset, setAsset] = useState("BTC");
  const [amount, setAmount] = useState(100);
  const [interval, setInterval] = useState("daily");
  const [fees, setFees] = useState(0.1); // 0.1%
  const [slippage, setSlippage] = useState(0.05); // 0.05%

  const backtest = useMemo(() => {
    // Advanced DCA Backtest Mock logic
    // In a real app, use historical series for 'asset'
    const totalInvested = 10000;
    const totalFees = totalInvested * (fees / 100);
    const avgBuyPrice = (state.prices[asset] || 50000) * 0.9;
    const currentPrice = state.prices[asset] || 50000;
    const qty = (totalInvested - totalFees) / (avgBuyPrice * (1 + slippage/100));
    const currentVal = qty * currentPrice;
    const pnl = currentVal - totalInvested;

    return { 
      totalInvested, 
      totalFees, 
      qty, 
      currentVal, 
      pnl, 
      pnlPct: (pnl / totalInvested) * 100,
      avgBuyPrice
    };
  }, [asset, amount, fees, slippage, state.prices]);

  return (
    <div className="planner-page" style={{ padding: 10 }}>
       <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20 }}>
          <div className="panel">
             <div className="panel-head"><h2>DCA Strategy Backtester 2.0</h2></div>
             <div className="panel-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                   <div className="form-field">
                      <label className="form-label">Asset to Backtest</label>
                      <select className="inp" value={asset} onChange={e => setAsset(e.target.value)}>
                         {Object.keys(state.prices).slice(0, 10).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                   <div className="form-field">
                      <label className="form-label">Amount per Entry ($)</label>
                      <input className="inp" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
                   </div>
                   <div className="form-field">
                      <label className="form-label">Interval</label>
                      <select className="inp" value={interval} onChange={e => setInterval(e.target.value)}>
                         <option value="daily">Daily</option>
                         <option value="weekly">Weekly</option>
                         <option value="monthly">Monthly</option>
                      </select>
                   </div>
                   <div className="form-field">
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
                         <span>TRADING FEES</span>
                         <span>{fees}%</span>
                      </label>
                      <input type="range" min="0" max="1" step="0.05" value={fees} onChange={e => setFees(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
                   </div>
                   <div className="form-field">
                      <label style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
                         <span>SLIPPAGE TOLERANCE</span>
                         <span>{slippage}%</span>
                      </label>
                      <input type="range" min="0" max="2" step="0.05" value={slippage} onChange={e => setSlippage(Number(e.target.value))} style={{ width: "100%", marginTop: 8 }} />
                   </div>
                </div>
                
                <button className="btn primary" style={{ marginTop: 20, width: "100%" }} onClick={() => toast.success("Backtest simulation recalculated.")}>
                   Run Simulation
                </button>
             </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
             <div className="panel" style={{ background: "var(--brand3)", border: "1px solid var(--brand)" }}>
                <div className="panel-head" style={{ border: "none" }}><h2>Simulation Result</h2></div>
                <div className="panel-body">
                   <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: "var(--brand)", fontWeight: 800, textTransform: "uppercase" }}>TOTAL P&L</div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: backtest.pnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                         ${backtest.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: backtest.pnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                         {backtest.pnl >= 0 ? "+" : ""}{backtest.pnlPct.toFixed(1)}%
                      </div>
                   </div>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                         <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Invested</div>
                         <div style={{ fontSize: 14, fontWeight: 800 }}>${backtest.totalInvested.toLocaleString()}</div>
                      </div>
                      <div>
                         <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Avg Cost</div>
                         <div style={{ fontSize: 14, fontWeight: 800 }}>${backtest.avgBuyPrice.toLocaleString()}</div>
                      </div>
                      <div>
                         <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Total Fees</div>
                         <div style={{ fontSize: 14, fontWeight: 800, color: "var(--bad)" }}>${backtest.totalFees.toFixed(2)}</div>
                      </div>
                      <div>
                         <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Final Quantity</div>
                         <div style={{ fontSize: 14, fontWeight: 800 }}>{backtest.qty.toFixed(4)} {asset}</div>
                      </div>
                   </div>
                </div>
             </div>

             <div className="panel">
                <div className="panel-head"><h2>Plan Summary</h2></div>
                <div className="panel-body" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text)" }}>
                   By investing ${amount} {interval} into {asset}, you would have accumulated {backtest.qty.toFixed(4)} {asset} over the selected period.
                   <br/><br/>
                   Your strategy efficiency was impacted by ${backtest.totalFees.toFixed(2)} in fees and ${ (backtest.totalInvested * slippage/100).toFixed(2) } in modeled slippage.
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
