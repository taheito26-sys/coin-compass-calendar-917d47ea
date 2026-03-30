import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { computeDrawdownSeries } from "@/lib/drawdownCalc";
import { fmtFiat } from "@/lib/cryptoState";

export default function MaxDrawdownChart() {
  const { state } = useCrypto();
  const getPrice = usePortfolioPriceGetter();
  const { points, maxDrawdown, maxDrawdownPct } = useMemo(
    () => computeDrawdownSeries(state.txs, getPrice),
    [state.txs, getPrice],
  );

  if (points.length < 2) return (
    <div className="panel"><div className="panel-head">Max Drawdown</div>
      <div className="panel-body muted" style={{ padding: 20, textAlign: "center" }}>Not enough data yet.</div>
    </div>
  );

  const maxDD = Math.max(...points.map(p => p.drawdownPct));
  const W = 100, H = 50;
  const toX = (i: number) => (i / (points.length - 1)) * W;
  const toY = (v: number) => (v / (maxDD || 1)) * H;
  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.drawdownPct)}`).join(" ");
  const areaPoints = `0,0 ${linePoints} ${W},0`;
  const currentDD = points[points.length - 1]?.drawdownPct ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">Max Drawdown Timeline</div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
          <div><div className="kpi-lbl">All-Time Max DD</div><div className="kpi-val bad">{maxDrawdownPct.toFixed(2)}%</div></div>
          <div><div className="kpi-lbl">Max DD ($)</div><div className="kpi-val bad">${fmtFiat(maxDrawdown)}</div></div>
          <div><div className="kpi-lbl">Current DD</div><div className={`kpi-val ${currentDD > 5 ? "bad" : "good"}`}>{currentDD.toFixed(2)}%</div></div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bad)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--bad)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#ddGrad)" />
          <polyline points={linePoints} fill="none" stroke="var(--bad)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="muted" style={{ fontSize: 10, marginTop: 4 }}>Higher = worse. The chart shows how far portfolio value dropped from its peak at each point in time.</p>
      </div>
    </div>
  );
}
