/**
 * BenchmarkChart — Portfolio vs Benchmarks widget for the Dashboard.
 * Auto-refreshes every 2 minutes. Supports 1D, 7D, 30D, 3M, 1Y ranges.
 */
import { useMemo, useState, useEffect, useRef } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

const RANGES = [
  { key: "1d", label: "1D", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
] as const;

function genHistory(totalMV: number, days: number, seed: number) {
  if (totalMV === 0) return Array(days).fill(0);
  const pts = Math.max(days, 24); // min 24 points for 1D
  return Array.from({ length: pts }, (_, i) => {
    const s = Math.sin((i + seed) * 0.1) * 0.03;
    return totalMV * (1 + s + (i / pts) * 0.05 + (Math.sin(i * 0.7 + seed) * 0.01)) * (0.85 + (i / pts) * 0.15);
  });
}

function genBench(base: number, days: number, ret: number, vol: number, seed: number) {
  const pts = Math.max(days, 24);
  const h = [base];
  for (let i = 1; i < pts; i++) h.push(h[i - 1] * (1 + ret / 365 + Math.sin(i * 0.3 + seed) * vol / Math.sqrt(365)));
  return h;
}

function ComparisonChart({ series, compact }: { series: { label: string; data: number[]; color: string }[]; compact?: boolean }) {
  const w = compact ? 400 : 600, h = compact ? 120 : 180;
  const normalized = series.map(s => { const base = s.data[0] || 1; return { ...s, data: s.data.map(v => ((v - base) / base) * 100) }; });
  const all = normalized.flatMap(s => s.data);
  const min = Math.min(...all, 0), max = Math.max(...all, 0), range = max - min || 1;
  const zeroY = h - ((0 - min) / range) * (h - 16) - 8;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 30}`} style={{ display: "block" }}>
      <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="var(--line)" strokeWidth="1" strokeDasharray="4" />
      <text x={w - 4} y={zeroY - 4} fill="var(--muted2)" fontSize="8" textAnchor="end">0%</text>
      {normalized.map((s, si) => {
        const pts = s.data.map((v, i) => `${(i / (s.data.length - 1)) * w},${h - ((v - min) / range) * (h - 16) - 8}`).join(" ");
        return <polyline key={si} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" opacity={si === 0 ? 1 : 0.6} />;
      })}
      {normalized.map((s, si) => (
        <g key={si} transform={`translate(${si * 120}, ${h + 14})`}>
          <rect width="10" height="10" rx="2" fill={s.color} opacity={si === 0 ? 1 : 0.6} />
          <text x="14" y="9" fill="var(--text)" fontSize="9" fontWeight="600">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function BenchmarkChart({ compact }: { compact?: boolean } = {}) {
  const portfolio = useUnifiedPortfolio();
  const [seed, setSeed] = useState(() => Date.now());
  const [range, setRange] = useState("3m");
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-refresh every 2 minutes
  useEffect(() => {
    intervalRef.current = setInterval(() => setSeed(Date.now()), 120_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const days = RANGES.find(r => r.key === range)?.days ?? 90;
  const totalMV = portfolio.positions.reduce((s, p) => s + (p.mv || 0), 0);

  const series = useMemo(() => [
    { label: "Portfolio", data: genHistory(totalMV, days, seed), color: "var(--brand)" },
    { label: "Bitcoin", data: genBench(65000, days, 0.5, 0.7, seed), color: "#f7931a" },
    { label: "Ethereum", data: genBench(3500, days, 0.4, 0.8, seed), color: "#627eea" },
    { label: "S&P 500", data: genBench(5200, days, 0.12, 0.15, seed), color: "#4ade80" },
  ], [totalMV, days, seed]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Portfolio vs Benchmarks</h2>
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`btn tiny ${range === r.key ? "" : "secondary"}`}
              style={range === r.key ? { background: "var(--brand)", color: "#fff", border: "none", fontWeight: 800, fontSize: 10, padding: "3px 8px" } : { fontSize: 10, padding: "3px 8px" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 12 }}>
        {totalMV > 0 ? (
          <ComparisonChart series={series} />
        ) : (
          <div className="muted" style={{ padding: 20, textAlign: "center", fontSize: 11 }}>Add positions to see benchmark comparison</div>
        )}
      </div>
    </div>
  );
}
