/**
 * Portfolio Correlation Risk Analyzer
 * Computes pairwise Pearson correlations from sparkline price data.
 * Identifies dangerously correlated pairs that reduce diversification.
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";

interface CorrelationPair {
  a: string;
  b: string;
  corr: number;
}

function logReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) r.push(Math.log(prices[i] / prices[i - 1]));
  }
  return r;
}

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : null;
}

function corrColor(c: number): string {
  if (c >= 0.7) return "var(--bad)";
  if (c >= 0.4) return "var(--warn)";
  if (c >= -0.2) return "var(--muted)";
  return "var(--good)";
}

function corrLabel(c: number): string {
  if (c >= 0.8) return "Very High";
  if (c >= 0.6) return "High";
  if (c >= 0.3) return "Moderate";
  if (c >= -0.3) return "Low";
  if (c >= -0.6) return "Inverse";
  return "Strong Inverse";
}

export default function CorrelationMatrix({ compact }: { compact?: boolean } = {}) {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  // Top assets by market value
  const topSyms = useMemo(() => {
    if (totalMV <= 0) return [];
    return positions
      .map(p => {
        const live = getPrice(p.sym);
        const mv = (live?.current_price ?? p.price ?? 0) * p.qty;
        return { sym: p.sym, mv, id: live?.id ?? p.sym.toLowerCase() };
      })
      .filter(p => p.mv > 0)
      .sort((a, b) => b.mv - a.mv)
      .slice(0, compact ? 5 : 8);
  }, [positions, totalMV, getPrice]);

  const coinIds = useMemo(() => topSyms.map(s => s.id), [topSyms]);
  const sparkData = useSparklineData(coinIds);

  const { pairs, matrix, avgCorr, diversificationScore } = useMemo(() => {
    const syms = topSyms.map(s => s.sym);
    const ids = topSyms.map(s => s.id);
    const returns = new Map<string, number[]>();

    for (let i = 0; i < ids.length; i++) {
      const prices = sparkData.get(ids[i]);
      if (prices && prices.length >= 4) {
        returns.set(syms[i], logReturns(prices));
      }
    }

    const pairs: CorrelationPair[] = [];
    const matrix: (number | null)[][] = [];

    for (let i = 0; i < syms.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < syms.length; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        const rx = returns.get(syms[i]);
        const ry = returns.get(syms[j]);
        const c = rx && ry ? pearson(rx, ry) : null;
        matrix[i][j] = c;
        if (j > i && c !== null) {
          pairs.push({ a: syms[i], b: syms[j], corr: c });
        }
      }
    }

    pairs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

    const validCorrs = pairs.filter(p => p.corr !== null).map(p => p.corr);
    const avgCorr = validCorrs.length > 0 ? validCorrs.reduce((s, c) => s + c, 0) / validCorrs.length : 0;
    // Diversification score: 0 = all perfectly correlated, 100 = all uncorrelated
    const diversificationScore = Math.max(0, Math.min(100, Math.round((1 - avgCorr) * 100)));

    return { pairs, matrix, avgCorr, diversificationScore };
  }, [topSyms, sparkData]);

  if (topSyms.length < 2) return null;

  const syms = topSyms.map(s => s.sym);
  const highCorrPairs = pairs.filter(p => p.corr >= 0.6);
  const inversePairs = pairs.filter(p => p.corr <= -0.3);

  const divColor = diversificationScore >= 60 ? "var(--good)" : diversificationScore >= 35 ? "var(--warn)" : "var(--bad)";

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Correlation Risk</h2>
        <span className="pill" style={{ background: divColor, color: "#fff", fontWeight: 700 }}>
          Div. Score: {diversificationScore}
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 320 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* Summary metrics */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>AVG CORR</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: corrColor(avgCorr) }}>
              {avgCorr.toFixed(2)}
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>HIGH CORR</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: highCorrPairs.length > 0 ? "var(--bad)" : "var(--good)" }}>
              {highCorrPairs.length} pair{highCorrPairs.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>HEDGES</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: inversePairs.length > 0 ? "var(--good)" : "var(--muted)" }}>
              {inversePairs.length} pair{inversePairs.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Correlation matrix heatmap */}
        <div style={{ padding: compact ? "6px" : "10px", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: compact ? 9 : 10 }}>
            <thead>
              <tr>
                <th style={{ padding: 3, fontWeight: 800 }}></th>
                {syms.map(s => (
                  <th key={s} style={{ padding: 3, fontWeight: 800, textAlign: "center", fontSize: compact ? 8 : 9 }}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {syms.map((row, i) => (
                <tr key={row}>
                  <td style={{ padding: 3, fontWeight: 800, fontSize: compact ? 8 : 9 }}>{row}</td>
                  {syms.map((col, j) => {
                    const c = matrix[i]?.[j];
                    const isIdentity = i === j;
                    const bg = isIdentity ? "var(--panel3)" :
                      c === null ? "var(--panel2)" :
                        `color-mix(in srgb, ${corrColor(c)} ${Math.round(Math.abs(c) * 40 + 10)}%, var(--card))`;
                    return (
                      <td key={col} style={{
                        padding: compact ? 2 : 4, textAlign: "center",
                        background: bg, fontFamily: "monospace",
                        fontWeight: isIdentity ? 400 : 700,
                        color: isIdentity ? "var(--muted)" : c !== null ? corrColor(c) : "var(--muted2)",
                        fontSize: compact ? 8 : 10,
                        border: "1px solid var(--line)",
                      }}>
                        {isIdentity ? "—" : c !== null ? c.toFixed(2) : "···"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notable pairs */}
        {!compact && (highCorrPairs.length > 0 || inversePairs.length > 0) && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>
            {highCorrPairs.slice(0, 3).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
                <span style={{ fontSize: 12 }}>⚠️</span>
                <span style={{ fontWeight: 700, color: "var(--bad)" }}>
                  {p.a}/{p.b}: {p.corr.toFixed(2)}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  — {corrLabel(p.corr)}, limited diversification benefit
                </span>
              </div>
            ))}
            {inversePairs.slice(0, 2).map((p, i) => (
              <div key={`inv-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
                <span style={{ fontSize: 12 }}>✅</span>
                <span style={{ fontWeight: 700, color: "var(--good)" }}>
                  {p.a}/{p.b}: {p.corr.toFixed(2)}
                </span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  — {corrLabel(p.corr)}, good hedge
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
