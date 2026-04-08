/**
 * Order Book Depth Analyzer
 * Detects thin order books by analyzing volume-to-market-cap ratios,
 * price impact estimates, and 1h/7d price volatility as depth proxies.
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { fmtTotal } from "@/lib/cryptoState";

interface DepthAnalysis {
  sym: string;
  mv: number;
  marketCap: number;
  volume24h: number;
  depthScore: number; // 0-100
  slippageEstimate: number; // estimated % slippage for full exit
  priceVolatility7d: number;
  level: "Deep" | "Normal" | "Thin" | "Critical";
}

function depthLevel(score: number): "Deep" | "Normal" | "Thin" | "Critical" {
  if (score >= 75) return "Deep";
  if (score >= 45) return "Normal";
  if (score >= 20) return "Thin";
  return "Critical";
}

function levelColor(l: string) {
  if (l === "Deep") return "var(--good)";
  if (l === "Normal") return "var(--brand)";
  if (l === "Thin") return "var(--warn)";
  return "var(--bad)";
}

function calcVolatility7d(prices: number[]): number {
  if (prices.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.abs(prices[i] / prices[i - 1] - 1));
  }
  if (returns.length === 0) return 0;
  return returns.reduce((s, r) => s + r, 0) / returns.length;
}

export default function OrderBookDepth({ compact }: { compact?: boolean } = {}) {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const coinIds = useMemo(() =>
    positions.map(p => {
      const live = getPrice(p.sym);
      return live?.id ?? p.sym.toLowerCase();
    }).slice(0, 12),
    [positions, getPrice]
  );
  const sparkData = useSparklineData(coinIds);

  const analysis = useMemo(() => {
    if (totalMV <= 0 || positions.length === 0) return null;

    const assets: DepthAnalysis[] = positions
      .map((p, idx) => {
        const live = getPrice(p.sym);
        const price = live?.current_price ?? p.price ?? 0;
        const mv = price * p.qty;
        const marketCap = live?.market_cap ?? 0;
        const volume24h = live?.total_volume ?? 0;

        // Sparkline volatility
        const coinId = coinIds[idx];
        const prices = sparkData.get(coinId) ?? [];
        const priceVolatility7d = calcVolatility7d(prices);

        // Depth score factors:
        // 1. Volume/market cap ratio (higher = deeper book)
        const volMcap = marketCap > 0 ? volume24h / marketCap : 0;
        const volScore = Math.min(40, volMcap * 400); // max 40 pts

        // 2. Market cap size (larger = deeper)
        const mcapScore = marketCap > 1e10 ? 30 : marketCap > 1e9 ? 22 : marketCap > 1e8 ? 14 : marketCap > 1e7 ? 8 : 2;

        // 3. Low volatility = deeper markets (inverse)
        const volStability = Math.max(0, 30 - priceVolatility7d * 500);

        const depthScore = Math.round(Math.min(100, volScore + mcapScore + volStability));

        // Estimated slippage for full position exit
        // Rough model: slippage ≈ (positionValue / dailyVolume) * impactFactor
        const impactFactor = 0.1; // 10% of volume share = ~1% slippage
        const slippageEstimate = volume24h > 0
          ? Math.min(50, (mv / volume24h) * impactFactor * 100)
          : 99;

        return {
          sym: p.sym, mv, marketCap, volume24h,
          depthScore, slippageEstimate, priceVolatility7d,
          level: depthLevel(depthScore),
        };
      })
      .filter(a => a.mv > 0)
      .sort((a, b) => a.depthScore - b.depthScore); // worst first

    const avgScore = assets.length > 0
      ? Math.round(assets.reduce((s, a) => s + a.depthScore, 0) / assets.length) : 0;
    const thinCount = assets.filter(a => a.level === "Thin" || a.level === "Critical").length;
    const portfolioLevel = depthLevel(avgScore);

    return { assets, avgScore, thinCount, portfolioLevel };
  }, [positions, totalMV, getPrice, coinIds, sparkData]);

  if (!analysis) return null;

  const { assets, avgScore, thinCount, portfolioLevel } = analysis;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Order Book Depth</h2>
        <span className="pill" style={{ background: levelColor(portfolioLevel), color: "#fff", fontWeight: 700 }}>
          Avg: {avgScore}/100
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 300 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* Summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>DEPTH SCORE</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: levelColor(portfolioLevel) }}>{avgScore}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>THIN MKTS</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: thinCount > 0 ? "var(--warn)" : "var(--good)" }}>{thinCount}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>ASSETS</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900 }}>{assets.length}</div>
          </div>
        </div>

        {/* Depth bars */}
        <div style={{ padding: compact ? "6px 10px" : "10px 14px" }}>
          {assets.slice(0, compact ? 6 : 10).map(a => (
            <div key={a.sym} style={{ marginBottom: compact ? 5 : 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: compact ? 9 : 11, marginBottom: 2 }}>
                <span style={{ fontWeight: 800 }}>{a.sym}</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: compact ? 8 : 9, color: "var(--muted)" }}>
                    Slip: {a.slippageEstimate < 0.01 ? "<0.01" : a.slippageEstimate.toFixed(2)}%
                  </span>
                  <span className="pill" style={{ fontSize: 7, background: levelColor(a.level), color: "#fff", fontWeight: 700 }}>
                    {a.level}
                  </span>
                </div>
              </div>
              <div style={{ height: compact ? 4 : 6, background: "var(--panel3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${a.depthScore}%`,
                  background: levelColor(a.level),
                  borderRadius: 3, transition: "width 0.3s",
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
