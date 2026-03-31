import React, { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";

export default function PlannerPage() {
  const { state } = useCrypto();
  const { getPrice } = useLivePrices();
  const [asset, setAsset] = useState("BTC");
  const [amount, setAmount] = useState(100);
  const [freq, setFreq] = useState("weekly");
  const [duration, setDuration] = useState("2"); // years

  const coins = useMemo(() => {
    // Top coins for selection
    return ["BTC", "ETH", "SOL", "BNB", "ADA", "XRP", "DOT", "LINK", "DOGE", "AVAX"];
  }, []);

  const results = useMemo(() => {
    // Simplified DCA calculation for demonstration
    // In a real app, this would fetch historical series
    const years = parseFloat(duration) || 1;
    const weeks = years * 52;
    const periods = freq === "daily" ? years * 365 : (freq === "weekly" ? weeks : years * 12);
    
    const totalInvested = amount * periods;
    
    // Mock performance based on asset
    const multipliers: Record<string, number> = {
      BTC: 2.4, ETH: 1.8, SOL: 5.2, BNB: 1.5, ADA: 0.8, XRP: 1.1, DOT: 0.9, LINK: 1.4, DOGE: 0.5, AVAX: 2.1
    };
    
    const currentPrice = getPrice(asset)?.current_price || 50000;
    const mult = multipliers[asset] || 1.2;
    const finalVal = totalInvested * mult;
    const pnlPct = ((finalVal - totalInvested) / totalInvested) * 100;
    
    return {
      totalInvested,
      finalVal,
      pnlPct,
      periods,
      coinQty: finalVal / currentPrice
    };
  }, [asset, amount, freq, duration, getPrice]);

  return (
    <div className="planner-page" style={{ padding: 10 }}>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>DCA Strategy Backtest</h2>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20, marginBottom: 24 }}>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Select Asset</label>
              <select className="inp" value={asset} onChange={e => setAsset(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4 }}>
                {coins.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Amount per Cycle</label>
              <input type="number" className="inp" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ width: "100%", padding: 10, marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Frequency</label>
              <select className="inp" value={freq} onChange={e => setFreq(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4 }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Time Period (Years)</label>
              <select className="inp" value={duration} onChange={e => setDuration(e.target.value)} style={{ width: "100%", padding: 10, marginTop: 4 }}>
                <option value="0.5">6 Months</option>
                <option value="1">1 Year</option>
                <option value="2">2 Years</option>
                <option value="3">3 Years</option>
                <option value="5">5 Years</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "var(--panel2)", padding: 20, borderRadius: 12, border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Total Invested</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{fmtFiat(results.totalInvested, "USD")}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>Across {results.periods} cycles</div>
            </div>
            <div style={{ background: "var(--panel2)", padding: 20, borderRadius: 12, border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Portfolio Value</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: results.pnlPct >= 0 ? "var(--good)" : "var(--bad)" }}>
                {fmtFiat(results.finalVal, "USD")}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
                <span style={{ color: results.pnlPct >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 800 }}>
                  {results.pnlPct >= 0 ? "▲" : "▼"} {results.pnlPct.toFixed(1)}%
                </span> vs holding USD
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, padding: 16, border: "1px dashed var(--line)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              By investing <span style={{ color: "var(--brand)", fontWeight: 800 }}>${amount}</span> every <span style={{ fontWeight: 700 }}>{freq}</span> for <span style={{ fontWeight: 700 }}>{duration} years</span>, 
              you would have accumulated approximately <span style={{ color: "#fff", fontWeight: 900 }}>{fmtQty(results.coinQty)} {asset}</span>.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
        <div className="panel">
          <div className="panel-head"><h2>Accumulation Goals</h2></div>
          <div className="panel-body">
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Set a goal and we'll calculate how to reach it.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
               <div>
                 <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>GOAL: REACH 1.0 {asset}</label>
                 <div style={{ height: 8, background: "var(--line)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                   <div style={{ width: "35%", height: "100%", background: "var(--brand)" }} />
                 </div>
                 <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 4 }}>
                   <span>0.35 {asset}</span>
                   <span>Target: 1.0 {asset}</span>
                 </div>
               </div>
               <div style={{ marginTop: 8, fontSize: 11, background: "rgba(255,255,255,0.02)", padding: 10, borderRadius: 6 }}>
                  At current rates, you'll reach this goal in <b>14 months</b>.
               </div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Why DCA?</h2></div>
          <div className="panel-body" style={{ fontSize: 13, lineHeight: 1.6, color: "#aaa" }}>
            Dollar-Cost Averaging (DCA) is a strategy where an investor invests a total sum of money in small amounts over time instead of all at once.
            <ul style={{ paddingLeft: 20, marginTop: 10 }}>
              <li>Reduces the impact of volatility.</li>
              <li>Avoids bad timing (buying the local top).</li>
              <li>Encourages disciplined saving habits.</li>
              <li>Automates wealth building.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
