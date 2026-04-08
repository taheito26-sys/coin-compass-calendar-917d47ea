/**
 * CommunityHealth — Standalone page-level component showing community health
 * grades for tracked coins. Uses sentiment_history data for A-F grading.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HistoryRow {
  token_symbol: string;
  sentiment_score: number;
  mention_count: number;
  snapshot_date: string;
}

interface CoinHealth {
  symbol: string;
  grade: string;
  gradeColor: string;
  composite: number;
  avgSentiment: number;
  totalMentions: number;
  volatility: number;
  consistency: number;
  dataPoints: number;
  trend: "improving" | "declining" | "stable";
  scores: number[];
}

function computeHealth(scores: number[], mentions: number[]): {
  grade: string; gradeColor: string; composite: number;
  avgSentiment: number; volatility: number; consistency: number;
} {
  const avgSentiment = scores.reduce((s, v) => s + v, 0) / scores.length;
  const totalMentions = mentions.reduce((s, v) => s + v, 0);
  const mean = avgSentiment;
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const volatility = Math.sqrt(variance);
  const consistency = Math.max(0, 100 - volatility * 5);
  const engagement = Math.min(100, totalMentions * 2);

  const composite = avgSentiment * 0.4 + engagement * 0.3 + consistency * 0.3;

  let grade: string, gradeColor: string;
  if (composite >= 80) { grade = "A"; gradeColor = "var(--good)"; }
  else if (composite >= 65) { grade = "B"; gradeColor = "var(--good)"; }
  else if (composite >= 50) { grade = "C"; gradeColor = "var(--warn)"; }
  else if (composite >= 35) { grade = "D"; gradeColor = "var(--bad)"; }
  else { grade = "F"; gradeColor = "var(--bad)"; }

  return { grade, gradeColor, composite, avgSentiment, volatility, consistency };
}

function GradeBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{
      width: "100%", height: 6, borderRadius: 3,
      background: "var(--panel2, rgba(0,0,0,.1))", overflow: "hidden",
    }}>
      <div style={{
        width: `${pct}%`, height: "100%", borderRadius: 3,
        background: color, transition: "width .3s ease",
      }} />
    </div>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 60, h = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CommunityHealth() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"grade" | "sentiment" | "mentions" | "consistency">("grade");
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sentiment_history")
        .select("token_symbol, sentiment_score, mention_count, snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1000);
      if (!error && data) setHistory(data as HistoryRow[]);
      setLoading(false);
    })();
  }, []);

  const coins = useMemo(() => {
    if (!history.length) return [];
    const bySymbol = new Map<string, HistoryRow[]>();
    for (const row of history) {
      const sym = row.token_symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(row);
    }

    const results: CoinHealth[] = [];
    for (const [symbol, rows] of bySymbol) {
      const sorted = [...rows].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const scores = sorted.map(r => r.sentiment_score);
      const mentions = sorted.map(r => r.mention_count);
      const totalMentions = mentions.reduce((s, v) => s + v, 0);

      const { grade, gradeColor, composite, avgSentiment, volatility, consistency } =
        computeHealth(scores, mentions);

      const recentAvg = scores.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, scores.length);
      const earlyAvg = scores.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, scores.length);
      const diff = recentAvg - earlyAvg;
      const trend = diff > 3 ? "improving" : diff < -3 ? "declining" : "stable";

      results.push({ symbol, grade, gradeColor, composite, avgSentiment, totalMentions, volatility, consistency, dataPoints: scores.length, trend, scores });
    }

    results.sort((a, b) => {
      switch (sortBy) {
        case "sentiment": return b.avgSentiment - a.avgSentiment;
        case "mentions": return b.totalMentions - a.totalMentions;
        case "consistency": return b.consistency - a.consistency;
        default: return b.composite - a.composite;
      }
    });

    return results;
  }, [history, sortBy]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
        Loading community health data…
      </div>
    );
  }

  if (!coins.length) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
        No sentiment history data yet. Community health grades will appear after the sentiment engine collects data.
      </div>
    );
  }

  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const c of coins) gradeDistribution[c.grade as keyof typeof gradeDistribution]++;

  const avgComposite = coins.reduce((s, c) => s + c.composite, 0) / coins.length;
  const improving = coins.filter(c => c.trend === "improving").length;
  const declining = coins.filter(c => c.trend === "declining").length;

  return (
    <div>
      {/* Summary stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 8, marginBottom: 14,
      }}>
        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Avg Health</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: avgComposite >= 60 ? "var(--good)" : avgComposite >= 40 ? "var(--warn)" : "var(--bad)" }}>
            {avgComposite.toFixed(0)}
          </div>
        </div>
        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Coins Tracked</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{coins.length}</div>
        </div>
        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Improving</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--good)" }}>{improving}</div>
        </div>
        <div className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Declining</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--bad)" }}>{declining}</div>
        </div>
        {/* Grade distribution */}
        {(["A", "B", "C", "D", "F"] as const).map(g => (
          <div key={g} className="panel" style={{ padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, marginBottom: 2 }}>Grade {g}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: g <= "B" ? "var(--good)" : g === "C" ? "var(--warn)" : "var(--bad)" }}>
              {gradeDistribution[g]}
            </div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {([
          { key: "grade", label: "Grade" },
          { key: "sentiment", label: "Sentiment" },
          { key: "mentions", label: "Mentions" },
          { key: "consistency", label: "Consistency" },
        ] as const).map(s => (
          <button
            key={s.key}
            className={sortBy === s.key ? "btn" : "btn secondary"}
            style={{ fontSize: 10, padding: "3px 10px" }}
            onClick={() => setSortBy(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Coin grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8,
      }}>
        {coins.map(c => (
          <div key={c.symbol} className="panel" style={{ padding: "12px 14px", cursor: "pointer", transition: "box-shadow .15s" }}
            onClick={() => setExpandedCoin(expandedCoin === c.symbol ? null : c.symbol)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center",
                  borderRadius: 8, fontWeight: 900, fontSize: 14,
                  background: `color-mix(in srgb, ${c.gradeColor} 15%, transparent)`,
                  color: c.gradeColor,
                }}>
                  {c.grade}
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{c.symbol}</div>
                  <div style={{ fontSize: 9, color: "var(--muted)" }}>
                    {c.dataPoints} data points ·{" "}
                    <span style={{ color: c.trend === "improving" ? "var(--good)" : c.trend === "declining" ? "var(--bad)" : "var(--muted)" }}>
                      {c.trend === "improving" ? "▲ Improving" : c.trend === "declining" ? "▼ Declining" : "● Stable"}
                    </span>
                  </div>
                </div>
              </div>
              <MiniSparkline data={c.scores} color={c.gradeColor} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 10 }}>
              <div>
                <div style={{ color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>Sentiment</div>
                <GradeBar value={c.avgSentiment} color={c.avgSentiment >= 60 ? "var(--good)" : c.avgSentiment >= 40 ? "var(--warn)" : "var(--bad)"} />
                <div style={{ fontFamily: "var(--lt-font-mono, monospace)", fontWeight: 700, marginTop: 2 }}>{c.avgSentiment.toFixed(0)}</div>
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>Consistency</div>
                <GradeBar value={c.consistency} color={c.consistency >= 70 ? "var(--good)" : c.consistency >= 40 ? "var(--warn)" : "var(--bad)"} />
                <div style={{ fontFamily: "var(--lt-font-mono, monospace)", fontWeight: 700, marginTop: 2 }}>{c.consistency.toFixed(0)}</div>
              </div>
            </div>

            <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)" }}>
              <span>{c.totalMentions} total mentions</span>
              <span>Score: {c.composite.toFixed(0)}</span>
            </div>

            {/* Drill-down detail */}
            {expandedCoin === c.symbol && (
              <CoinDrillDown symbol={c.symbol} history={history} coinData={c} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
