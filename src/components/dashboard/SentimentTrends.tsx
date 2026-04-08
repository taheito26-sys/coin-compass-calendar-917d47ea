/**
 * SentimentTrends — Dashboard widget showing per-coin sentiment sparklines,
 * community health grades, and trend direction from sentiment_history data.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

interface HistoryRow {
  token_symbol: string;
  sentiment_score: number;
  mention_count: number;
  snapshot_date: string;
  source: string;
}

interface CoinTrend {
  symbol: string;
  scores: number[];
  mentions: number[];
  dates: string[];
  currentScore: number;
  avgScore: number;
  mentionTotal: number;
  trend: "rising" | "falling" | "stable";
  grade: string;
  gradeColor: string;
}

function computeGrade(avgScore: number, mentionTotal: number, volatility: number): { grade: string; color: string } {
  // Composite: 40% avg sentiment, 30% engagement, 30% consistency
  const sentComponent = avgScore; // 0-100
  const engComponent = Math.min(100, mentionTotal * 2); // scale mentions
  const consistComponent = Math.max(0, 100 - volatility * 5); // low vol = good

  const composite = sentComponent * 0.4 + engComponent * 0.3 + consistComponent * 0.3;

  if (composite >= 80) return { grade: "A", color: "var(--good)" };
  if (composite >= 65) return { grade: "B", color: "var(--good)" };
  if (composite >= 50) return { grade: "C", color: "var(--warn)" };
  if (composite >= 35) return { grade: "D", color: "var(--bad)" };
  return { grade: "F", color: "var(--bad)" };
}

function MiniSparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <span style={{ color: "var(--muted2)", fontSize: 9 }}>—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising") return <span style={{ color: "var(--good)", fontWeight: 800, fontSize: 12 }}>▲</span>;
  if (trend === "falling") return <span style={{ color: "var(--bad)", fontWeight: 800, fontSize: 12 }}>▼</span>;
  return <span style={{ color: "var(--muted)", fontSize: 12 }}>●</span>;
}

export default function SentimentTrends({ compact }: { compact?: boolean } = {}) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { positions } = useUnifiedPortfolio();

  // Get portfolio symbols for priority display
  const portfolioSyms = useMemo(() =>
    positions.map(p => p.sym.toUpperCase()).filter(Boolean),
    [positions]
  );

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      const { data, error } = await supabase
        .from("sentiment_history")
        .select("token_symbol, sentiment_score, mention_count, snapshot_date, source")
        .order("snapshot_date", { ascending: false })
        .limit(1000);

      if (!error && data) {
        setHistory(data as HistoryRow[]);
      }
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const trends = useMemo(() => {
    if (!history.length) return [];

    // Group by symbol
    const bySymbol = new Map<string, HistoryRow[]>();
    for (const row of history) {
      const sym = row.token_symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(row);
    }

    const results: CoinTrend[] = [];
    for (const [symbol, rows] of bySymbol) {
      // Sort by date ascending
      const sorted = [...rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const scores = sorted.map(r => r.sentiment_score);
      const mentions = sorted.map(r => r.mention_count);
      const dates = sorted.map(r => r.snapshot_date);

      const currentScore = scores[scores.length - 1] ?? 50;
      const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
      const mentionTotal = mentions.reduce((s, v) => s + v, 0);

      // Volatility = std dev
      const mean = avgScore;
      const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
      const volatility = Math.sqrt(variance);

      // Trend: compare last 3 vs first 3
      const recentAvg = scores.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, scores.length);
      const earlyAvg = scores.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, scores.length);
      const diff = recentAvg - earlyAvg;
      const trend = diff > 3 ? "rising" : diff < -3 ? "falling" : "stable";

      const { grade, color: gradeColor } = computeGrade(avgScore, mentionTotal, volatility);

      results.push({ symbol, scores, mentions, dates, currentScore, avgScore, mentionTotal, trend, grade, gradeColor });
    }

    // Sort: portfolio coins first, then by mention count
    results.sort((a, b) => {
      const aInPortfolio = portfolioSyms.includes(a.symbol) ? 0 : 1;
      const bInPortfolio = portfolioSyms.includes(b.symbol) ? 0 : 1;
      if (aInPortfolio !== bInPortfolio) return aInPortfolio - bInPortfolio;
      return b.mentionTotal - a.mentionTotal;
    });

    return results.slice(0, compact ? 8 : 20);
  }, [history, portfolioSyms, compact]);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Sentiment Trends</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
          Loading sentiment data…
        </div>
      </div>
    );
  }

  if (!trends.length) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Sentiment Trends</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No sentiment history yet. Data will populate after the sentiment engine runs.
        </div>
      </div>
    );
  }

  // Summary stats
  const avgAll = trends.reduce((s, t) => s + t.currentScore, 0) / trends.length;
  const risingCount = trends.filter(t => t.trend === "rising").length;
  const fallingCount = trends.filter(t => t.trend === "falling").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Sentiment Trends</h2>
        <span className="pill" style={{ fontWeight: 700 }}>
          {trends.length} coins
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {/* Summary bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>AVG SENTIMENT</div>
            <div style={{
              fontSize: compact ? 12 : 16, fontWeight: 900,
              color: avgAll >= 60 ? "var(--good)" : avgAll <= 40 ? "var(--bad)" : "var(--warn)"
            }}>
              {avgAll.toFixed(0)}
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>RISING</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: "var(--good)" }}>
              {risingCount}
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>FALLING</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: "var(--bad)" }}>
              {fallingCount}
            </div>
          </div>
        </div>

        {/* Coin list */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: compact ? 10 : 11, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", color: "var(--muted)", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>Coin</th>
                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>Grade</th>
                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>Score</th>
                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>Trend</th>
                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>Sparkline</th>
                <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>Mentions</th>
              </tr>
            </thead>
            <tbody>
              {trends.map(t => {
                const isPortfolio = portfolioSyms.includes(t.symbol);
                return (
                  <tr key={t.symbol} style={{
                    borderBottom: "1px solid var(--line)",
                    background: isPortfolio ? "var(--brand3, rgba(79,70,229,.04))" : undefined,
                  }}>
                    <td style={{ padding: "6px 8px", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {t.symbol}
                      {isPortfolio && <span style={{ marginLeft: 4, fontSize: 8, color: "var(--brand)", fontWeight: 600 }}>●</span>}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", width: 22, height: 22, lineHeight: "22px",
                        borderRadius: 6, fontWeight: 900, fontSize: 11,
                        background: `color-mix(in srgb, ${t.gradeColor} 15%, transparent)`,
                        color: t.gradeColor, textAlign: "center",
                      }}>
                        {t.grade}
                      </span>
                    </td>
                    <td style={{
                      padding: "6px 8px", textAlign: "center", fontFamily: "var(--lt-font-mono, monospace)",
                      fontWeight: 700,
                      color: t.currentScore >= 60 ? "var(--good)" : t.currentScore <= 40 ? "var(--bad)" : "var(--text)",
                    }}>
                      {t.currentScore}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <TrendArrow trend={t.trend} />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <MiniSparkline
                        data={t.scores}
                        color={t.currentScore >= 60 ? "var(--good)" : t.currentScore <= 40 ? "var(--bad)" : "var(--warn)"}
                      />
                    </td>
                    <td style={{
                      padding: "6px 8px", textAlign: "right",
                      fontFamily: "var(--lt-font-mono, monospace)", fontWeight: 600, color: "var(--muted)",
                    }}>
                      {t.mentionTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
