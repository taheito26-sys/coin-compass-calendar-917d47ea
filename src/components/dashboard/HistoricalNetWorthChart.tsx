import { useMemo, useState } from "react";
import { useNetWorthHistory } from "@/hooks/useNetWorthHistory";
import { fmtFiat } from "@/lib/cryptoState";

const RANGES = ["1M","3M","6M","1Y","ALL"] as const;
type Range = typeof RANGES[number];

function rangeMs(r: Range): number {
  const d = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: 99999 };
  return (d[r] || 365) * 86_400_000;
}

export default function HistoricalNetWorthChart() {
  const points = useNetWorthHistory();
  const [range, setRange] = useState<Range>("ALL");

  const filtered = useMemo(() => {
    const cutoff = Date.now() - rangeMs(range);
    return points.filter(p => p.ts >= cutoff);
  }, [points, range]);

  if (filtered.length < 2) {
    return (
      <div className="panel">
        <div className="panel-head">Historical Net Worth</div>
        <div className="panel-body" style={{ textAlign: "center", padding: 32 }}>
          <span className="muted">Add more transactions across multiple days to see your net worth history.</span>
        </div>
      </div>
    );
  }

  const maxV = Math.max(...filtered.map(p => p.value));
  const minV = Math.min(...filtered.map(p => p.value));
  const range2 = maxV - minV || 1;
  const W = 100, H = 60;

  const toX = (i: number) => (i / (filtered.length - 1)) * W;
  const toY = (v: number) => H - ((v - minV) / range2) * H;

  const polylinePoints = filtered.map((p, i) => `${toX(i)},${toY(p.value)}`).join(" ");
  const areaPoints = `0,${H} ${polylinePoints} ${W},${H}`;

  const last = filtered[filtered.length - 1];
  const first = filtered[0];
  const delta = last.value - first.value;
  const deltaPct = first.value > 0 ? (delta / first.value) * 100 : 0;
  const isPos = delta >= 0;

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Historical Net Worth</span>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map(r => (
            <button key={r} className={`btn tiny${r === range ? "" : " secondary"}`}
              style={{ fontSize: 10, padding: "2px 7px" }} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
          <div>
            <div className="kpi-lbl">Current Value</div>
            <div className="kpi-val mono">${fmtFiat(last.value)}</div>
          </div>
          <div>
            <div className="kpi-lbl">Change ({range})</div>
            <div className={`kpi-val mono ${isPos ? "good" : "bad"}`}>{isPos ? "+" : ""}${fmtFiat(delta)} ({isPos ? "+" : ""}{deltaPct.toFixed(2)}%)</div>
          </div>
          <div>
            <div className="kpi-lbl">Cost Basis</div>
            <div className="kpi-val mono">${fmtFiat(last.cost)}</div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPos ? "var(--good)" : "var(--bad)"} stopOpacity="0.3" />
              <stop offset="100%" stopColor={isPos ? "var(--good)" : "var(--bad)"} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#nwGrad)" />
          <polyline points={polylinePoints} fill="none" stroke={isPos ? "var(--good)" : "var(--bad)"} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span className="muted" style={{ fontSize: 10 }}>{new Date(first.ts).toLocaleDateString()}</span>
          <span className="muted" style={{ fontSize: 10 }}>{new Date(last.ts).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
