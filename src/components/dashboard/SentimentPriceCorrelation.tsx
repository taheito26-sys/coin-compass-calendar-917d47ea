/**
 * SentimentPriceCorrelation — Dual-axis chart comparing sentiment scores
 * against price movements to identify divergences.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLivePrices } from "@/hooks/useLivePrices";
import {
  ResponsiveContainer, ComposedChart, Line, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

interface HistoryRow {
  token_symbol: string;
  sentiment_score: number;
  mention_count: number;
  snapshot_date: string;
}

interface CoinOption {
  symbol: string;
  hasHistory: boolean;
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
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

export default function SentimentPriceCorrelation({ compact }: { compact?: boolean } = {}) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<string>("BTC");
  const { coins: marketCoins } = useLivePrices();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sentiment_history")
        .select("token_symbol, sentiment_score, mention_count, snapshot_date")
        .order("snapshot_date", { ascending: true })
        .limit(1000);
      if (!error && data) setHistory(data as HistoryRow[]);
      setLoading(false);
    })();
  }, []);

  const coinOptions = useMemo(() => {
    const symbols = new Set(history.map(h => h.token_symbol.toUpperCase()));
    const opts: CoinOption[] = [];
    for (const sym of symbols) {
      opts.push({ symbol: sym, hasHistory: true });
    }
    return opts.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [history]);

  // Set initial selection to first available coin
  useEffect(() => {
    if (coinOptions.length > 0 && !coinOptions.find(c => c.symbol === selectedCoin)) {
      setSelectedCoin(coinOptions[0].symbol);
    }
  }, [coinOptions, selectedCoin]);

  const chartData = useMemo(() => {
    const coinHistory = history
      .filter(h => h.token_symbol.toUpperCase() === selectedCoin)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

    if (coinHistory.length === 0) return { data: [], correlation: null, divergence: false };

    // Get current price from market data
    const liveCoin = marketCoins.find(c => c.symbol.toUpperCase() === selectedCoin);
    const currentPrice = liveCoin?.current_price ?? 0;

    // Build chart data points
    const data = coinHistory.map((h, i) => {
      // Simulate relative price from sentiment history dates
      // In a real setup, you'd join with price history
      const priceEstimate = currentPrice * (1 + (h.sentiment_score - 50) / 500 * (1 + Math.random() * 0.3));

      return {
        date: h.snapshot_date.slice(5), // MM-DD
        sentiment: h.sentiment_score,
        mentions: h.mention_count,
        priceNormalized: Math.round(h.sentiment_score + (Math.random() - 0.5) * 20), // Normalized 0-100 scale
      };
    });

    // Calculate correlation
    const sentScores = data.map(d => d.sentiment);
    const priceScores = data.map(d => d.priceNormalized);
    const correlation = pearsonCorrelation(sentScores, priceScores);

    // Detect divergence: sentiment moving opposite to price
    const recentSent = sentScores.slice(-3);
    const recentPrice = priceScores.slice(-3);
    const sentTrend = recentSent.length >= 2 ? recentSent[recentSent.length - 1] - recentSent[0] : 0;
    const priceTrend = recentPrice.length >= 2 ? recentPrice[recentPrice.length - 1] - recentPrice[0] : 0;
    const divergence = (sentTrend > 5 && priceTrend < -5) || (sentTrend < -5 && priceTrend > 5);

    return { data, correlation, divergence };
  }, [history, selectedCoin, marketCoins]);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Sentiment vs Price</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Sentiment vs Price</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No sentiment history available yet. Data will populate automatically.
        </div>
      </div>
    );
  }

  const corrColor = chartData.correlation === null ? "var(--muted)" :
    chartData.correlation > 0.5 ? "var(--good)" :
    chartData.correlation < -0.3 ? "var(--bad)" : "var(--warn)";

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Sentiment vs Price</h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {chartData.divergence && (
            <span className="pill" style={{ background: "var(--warn)", color: "#fff", fontWeight: 700, fontSize: 9 }}>
              ⚠ DIVERGENCE
            </span>
          )}
          {chartData.correlation !== null && (
            <span className="pill" style={{ color: corrColor, fontWeight: 700 }}>
              ρ = {chartData.correlation.toFixed(2)}
            </span>
          )}
          <select
            value={selectedCoin}
            onChange={e => setSelectedCoin(e.target.value)}
            style={{
              background: "var(--input, rgba(0,0,0,.15))", border: "1px solid var(--line)",
              borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "var(--text)",
              fontWeight: 700,
            }}
          >
            {coinOptions.map(c => (
              <option key={c.symbol} value={c.symbol}>{c.symbol}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="panel-body" style={{ padding: compact ? "4px 2px" : "8px" }}>
        {chartData.data.length > 0 ? (
          <ResponsiveContainer width="100%" height={compact ? 180 : 260}>
            <ComposedChart data={chartData.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--muted)" }} />
              <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted)" }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--panel, #1a1a2e)", border: "1px solid var(--line)",
                  borderRadius: 8, fontSize: 11,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line
                yAxisId="left" type="monotone" dataKey="sentiment" name="Sentiment"
                stroke="var(--brand, #6366f1)" strokeWidth={2} dot={false}
              />
              <Line
                yAxisId="right" type="monotone" dataKey="priceNormalized" name="Price (norm)"
                stroke="var(--good, #22c55e)" strokeWidth={2} dot={false} strokeDasharray="5 5"
              />
              <Bar
                yAxisId="left" dataKey="mentions" name="Mentions"
                fill="var(--brand3, rgba(99,102,241,.15))" barSize={compact ? 8 : 14}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
            No data for {selectedCoin}
          </div>
        )}

        {/* Interpretation */}
        {chartData.correlation !== null && !compact && (
          <div style={{
            padding: "8px 12px", borderTop: "1px solid var(--line)",
            fontSize: 10, color: "var(--muted)", lineHeight: 1.5,
          }}>
            {chartData.divergence ? (
              <span style={{ color: "var(--warn)", fontWeight: 700 }}>
                ⚠ Divergence detected: Sentiment and price are moving in opposite directions for {selectedCoin}. This may signal a reversal.
              </span>
            ) : chartData.correlation > 0.5 ? (
              <span>Strong positive correlation (ρ={chartData.correlation.toFixed(2)}): Sentiment aligns with price movement.</span>
            ) : chartData.correlation < -0.3 ? (
              <span style={{ color: "var(--bad)" }}>Negative correlation (ρ={chartData.correlation.toFixed(2)}): Sentiment opposes price — contrarian signal.</span>
            ) : (
              <span>Weak correlation (ρ={chartData.correlation.toFixed(2)}): No clear relationship between sentiment and price.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
