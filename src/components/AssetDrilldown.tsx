import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx } from "@/lib/cryptoState";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useMemo, useState, useEffect } from "react";
import { getDailyHistory } from "@/lib/priceProvider";
import { KNOWN_IDS } from "@/lib/priceProvider";

interface Props {
  sym: string;
  onClose: () => void;
}

function PriceChart({ sym }: { sym: string }) {
  const [data, setData] = useState<{ day: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    getDailyHistory(sym, days).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [sym, days]);

  if (loading) {
    return (
      <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="muted" style={{ fontSize: 11 }}>Loading chart…</span>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="muted" style={{ fontSize: 11 }}>No price data available for {sym}</span>
      </div>
    );
  }

  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 100;
  const h = 160;
  const padding = 2;

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? "var(--good, #22c55e)" : "var(--bad, #ef4444)";
  const fillColor = isUp ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";

  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (w - padding * 2);
    const y = padding + (1 - (p - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${padding + w - padding * 2},${h - padding} L${padding},${h - padding} Z`;

  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const change = ((lastPrice - firstPrice) / firstPrice) * 100;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--muted)", margin: 0 }}>
          Price Chart
        </h4>
        <div style={{ flex: 1 }} />
        <div className="seg" style={{ gap: 0 }}>
          {[1, 7, 30, 90, 365].map(d => (
            <button
              key={d}
              className={days === d ? "active" : ""}
              onClick={() => setDays(d)}
              style={{ fontSize: 9, padding: "2px 8px" }}
            >
              {d === 365 ? "1Y" : d + "D"}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        background: "var(--panel2, rgba(0,0,0,.03))",
        borderRadius: "var(--lt-radius-sm)",
        padding: "12px 16px",
        border: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <span className="mono" style={{ fontSize: 18, fontWeight: 800 }}>${fmtPx(lastPrice)}</span>
            <span className={`mono ${isUp ? "good" : "bad"}`} style={{ fontSize: 12, fontWeight: 700, marginLeft: 8 }}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </span>
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right" }}>
            <div>High: ${fmtPx(max)}</div>
            <div>Low: ${fmtPx(min)}</div>
          </div>
        </div>

        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 160 }} preserveAspectRatio="none">
          <path d={areaPath} fill={fillColor} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "var(--muted)" }}>
          <span>{data[0].day}</span>
          <span>{data[data.length - 1].day}</span>
        </div>
      </div>
    </div>
  );
}

export default function AssetDrilldown({ sym, onClose }: Props) {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const base = portfolio.base;

  const position = portfolio.getPosition(sym);

  const qty = position?.qty ?? 0;
  const avgCost = position?.avg ?? 0;
  const currentPrice = position?.price ?? null;
  const totalCost = position?.cost ?? 0;
  const mv = position?.mv ?? null;
  const unrealizedPnl = position?.unreal ?? null;
  const unrealizedPct = totalCost > 0 && unrealizedPnl !== null ? (unrealizedPnl / totalCost) * 100 : null;
  const realizedPnl = position?.realizedPnl ?? 0;
  const lots = position?.lots ?? [];

  const txs = useMemo(() => {
    return state.txs
      .filter(t => t.asset.toUpperCase() === sym.toUpperCase())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50);
  }, [state.txs, sym]);

  return (
    <div className="modalBg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modalHead">
          <h3>{sym} — Asset Detail</h3>
          <button className="btn tiny secondary" onClick={onClose}>✕ Close</button>
        </div>
        <div className="modalBody">
          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
            <div className="cal-stat">
              <div className="kpi-lbl">Holdings</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{fmtQty(qty)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Avg Cost</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>${fmtPx(avgCost)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Current Price</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{currentPrice !== null ? fmtPx(currentPrice) : "—"}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Market Value</div>
              <div className="kpi-val" style={{ fontSize: 16 }}>{mv !== null ? fmtFiat(mv, base) : "—"}</div>
            </div>
          </div>

          {/* Price Chart */}
          <PriceChart sym={sym} />

          {/* P&L Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
            <div className="cal-stat">
              <div className="kpi-lbl">Cost Basis</div>
              <div className="kpi-val" style={{ fontSize: 14 }}>{fmtFiat(totalCost, base)}</div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Unrealized P&L</div>
              <div className={`kpi-val ${unrealizedPnl !== null ? (unrealizedPnl >= 0 ? "good" : "bad") : ""}`} style={{ fontSize: 14 }}>
                {unrealizedPnl !== null ? (unrealizedPnl >= 0 ? "+" : "") + fmtFiat(unrealizedPnl, base) : "—"}
                {unrealizedPct !== null && <span style={{ fontSize: 10, marginLeft: 4 }}>({unrealizedPct.toFixed(2)}%)</span>}
              </div>
            </div>
            <div className="cal-stat">
              <div className="kpi-lbl">Realized P&L</div>
              <div className={`kpi-val ${realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 14 }}>
                {(realizedPnl >= 0 ? "+" : "") + fmtFiat(realizedPnl, base)}
              </div>
            </div>
          </div>

          {/* Open Lots */}
          {lots.length > 0 && (
            <>
              <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                Open Lots ({lots.length})
              </h4>
              <div className="tableWrap" style={{ marginBottom: 16, margin: "0 -14px", borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Qty</th><th>Remaining</th><th>Unit Cost</th><th>Cost Basis</th></tr>
                  </thead>
                  <tbody>
                    {lots.map(l => (
                      <tr key={l.id}>
                        <td className="mono">{new Date(l.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</td>
                        <td className="mono">{fmtQty(l.qty)}</td>
                        <td className="mono">{fmtQty(l.qtyRem)}</td>
                        <td className="mono">${fmtPx(l.unitCost)}</td>
                        <td className="mono">{fmtFiat(l.qtyRem * l.unitCost, base)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Transaction History */}
          <h4 style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Transaction History ({txs.length})
          </h4>
          <div className="tableWrap" style={{ margin: "0 -14px", borderRadius: 0, borderLeft: "none", borderRight: "none" }}>
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Value</th><th>Fee</th></tr>
              </thead>
              <tbody>
                {txs.length > 0 ? txs.map(t => (
                  <tr key={t.id}>
                    <td className="mono">{new Date(t.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })}</td>
                    <td className={`mono ${t.type === "buy" ? "good" : t.type === "sell" ? "bad" : ""}`} style={{ fontWeight: 900 }}>{t.type.toUpperCase()}</td>
                    <td className="mono">{fmtQty(t.qty)}</td>
                    <td className="mono">${fmtPx(t.price)}</td>
                    <td className="mono">{fmtFiat(t.qty * t.price, base)}</td>
                    <td className="mono muted">{t.fee > 0 ? fmtFiat(t.fee, base) : "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="muted">No transactions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
            {lots.length} open lots · {txs.length} transactions
          </div>
        </div>
      </div>
    </div>
  );
}
