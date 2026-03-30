/**
 * Fear & Greed Index gauge widget for Dashboard
 * Fetches via Worker proxy, caches locally
 */
import { useState, useEffect } from "react";
import { isWorkerConfigured } from "@/lib/api";

const WORKER_BASE = (import.meta.env.VITE_WORKER_API_URL || "").replace(/\/$/, "");

interface FearGreedData {
  value: number;
  label: string;
  history?: { value: number; label: string; ts: number }[];
}

function getColor(val: number): string {
  if (val <= 25) return "var(--bad)";
  if (val <= 45) return "#e97320";
  if (val <= 55) return "var(--warn)";
  if (val <= 75) return "#7cc832";
  return "var(--good)";
}

function getLabel(val: number): string {
  if (val <= 25) return "Extreme Fear";
  if (val <= 45) return "Fear";
  if (val <= 55) return "Neutral";
  if (val <= 75) return "Greed";
  return "Extreme Greed";
}

export default function FearGreedGauge() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Try cached first
        const cached = localStorage.getItem("lt_fng");
        if (cached) {
          const p = JSON.parse(cached);
          if (p.ts && Date.now() - p.ts < 600_000) {
            setData(p);
            setLoading(false);
          }
        }

        const url = isWorkerConfigured()
          ? `${WORKER_BASE}/api/fear-greed`
          : "https://api.alternative.me/fng/?limit=1&format=json";

        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`${r.status}`);
        const json = await r.json();

        let val: number, label: string, history: any[] | undefined;
        if (json.value !== undefined) {
          val = json.value;
          label = json.label;
          history = json.history;
        } else if (json.data?.[0]) {
          val = parseInt(json.data[0].value);
          label = json.data[0].value_classification;
        } else {
          throw new Error("Bad format");
        }

        const result = { value: val, label: label || getLabel(val), history, ts: Date.now() };
        if (!cancelled) {
          setData(result);
          setLoading(false);
          localStorage.setItem("lt_fng", JSON.stringify(result));
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 600_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (loading && !data) {
    return (
      <div className="panel" style={{ padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>Market Mood</div>
        <div style={{ color: "var(--muted2)", fontSize: 11, marginTop: 8 }}>Loading...</div>
      </div>
    );
  }

  if (!data || data.value === null || data.value === undefined) {
    return null;
  }

  const val = data.value;
  const color = getColor(val);

  // SVG gauge arc
  const size = 120;
  const r = 48;
  const strokeW = 10;
  const startAngle = -135;
  const endAngle = 135;
  const totalAngle = endAngle - startAngle; // 270°
  const needleAngle = startAngle + (val / 100) * totalAngle;

  const arcPath = (start: number, end: number) => {
    const s = (start * Math.PI) / 180;
    const e = (end * Math.PI) / 180;
    const cx = size / 2, cy = size / 2 + 8;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const needleRad = (needleAngle * Math.PI) / 180;
  const cx = size / 2, cy = size / 2 + 8;
  const nx = cx + (r - 4) * Math.cos(needleRad);
  const ny = cy + (r - 4) * Math.sin(needleRad);

  return (
    <div className="panel" style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
        Market Mood
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.75}`}>
          {/* Background arc */}
          <path d={arcPath(startAngle, endAngle)} fill="none" stroke="var(--line)" strokeWidth={strokeW} strokeLinecap="round" />
          {/* Value arc */}
          <path d={arcPath(startAngle, needleAngle)} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          {/* Needle dot */}
          <circle cx={nx} cy={ny} r={5} fill={color} />
          <circle cx={nx} cy={ny} r={3} fill="var(--panel)" />
          {/* Center value */}
          <text x={cx} y={cy + 2} textAnchor="middle" fill={color} fontSize="20" fontWeight="900">{val}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--muted)" fontSize="7" fontWeight="600">{data.label}</text>
        </svg>
        {data.history && data.history.length > 1 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4 }}>30-Day Trend</div>
            <FngSparkline data={data.history} />
          </div>
        )}
      </div>
    </div>
  );
}

function FngSparkline({ data }: { data: { value: number }[] }) {
  const reversed = [...data].reverse();
  const w = 100, h = 28;
  const points = reversed.map((d, i) =>
    `${(i / (reversed.length - 1)) * w},${h - (d.value / 100) * h}`
  ).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
