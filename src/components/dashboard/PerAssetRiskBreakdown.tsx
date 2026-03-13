/**
 * Per-Asset Risk Breakdown — real volatility from sparkline data, VaR & CVaR
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { fmtTotal } from "@/lib/cryptoState";

interface AssetRisk {
  sym: string;
  mv: number;
  weight: number;
  volatility: number; // annualised
  dailyVol: number;
  riskScore: "Low" | "Medium" | "High";
  concentration: "Diversified" | "Moderate" | "Concentrated";
  var95: number; // 1-day VaR 95%
  cvar95: number; // 1-day CVaR 95%
}

const RISK_COLORS = {
  Low: "var(--good)",
  Medium: "var(--warn)",
  High: "var(--bad)",
};

const CONC_COLORS = {
  Diversified: "var(--good)",
  Moderate: "var(--warn)",
  Concentrated: "var(--bad)",
};

// Z-scores for normal distribution
const Z_95 = 1.6449;
const Z_CVaR_95 = 2.0627; // E[Z | Z > 1.6449] ≈ φ(1.6449)/(1-Φ(1.6449))

/** Compute annualised volatility from daily prices */
function calcVolatility(prices: number[]): { daily: number; annual: number } {
  if (prices.length < 3) return { daily: 0, annual: 0 };
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  if (returns.length < 2) return { daily: 0, annual: 0 };
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const daily = Math.sqrt(variance);
  return { daily, annual: daily * Math.sqrt(365) };
}

/** Fallback volatility when no sparkline data */
function estimateVolatility(sym: string): { daily: number; annual: number } {
  const stables = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP"];
  const largeCaps = ["BTC", "ETH"];
  const midCaps = ["BNB", "XRP", "ADA", "SOL", "DOT", "AVAX", "MATIC", "LINK"];
  if (stables.includes(sym.toUpperCase())) return { daily: 0.001, annual: 0.02 };
  if (largeCaps.includes(sym.toUpperCase())) return { daily: 0.025, annual: 0.45 };
  if (midCaps.includes(sym.toUpperCase())) return { daily: 0.035, annual: 0.65 };
  return { daily: 0.045, annual: 0.85 };
}

function getRiskScore(vol: number, weight: number): "Low" | "Medium" | "High" {
  const combinedRisk = vol * 0.6 + weight * 0.4;
  if (combinedRisk < 0.25) return "Low";
  if (combinedRisk < 0.5) return "Medium";
  return "High";
}

function getConcentration(weight: number): "Diversified" | "Moderate" | "Concentrated" {
  if (weight < 0.15) return "Diversified";
  if (weight < 0.35) return "Moderate";
  return "Concentrated";
}

export default function PerAssetRiskBreakdown({ compact }: { compact?: boolean } = {}) {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  // Get sparkline coin IDs
  const coinIds = useMemo(() =>
    positions.map(p => {
      const live = getPrice(p.sym);
      return live?.id ?? p.sym.toLowerCase();
    }),
    [positions, getPrice]
  );
  const sparkData = useSparklineData(coinIds);

  const assetRisks = useMemo((): AssetRisk[] => {
    if (totalMV <= 0 || positions.length === 0) return [];

    return positions
      .map((p, idx) => {
        const live = getPrice(p.sym);
        const price = live?.current_price ?? p.price ?? 0;
        const mv = price * p.qty;
        const weight = mv / totalMV;

        // Real volatility from sparkline, fallback to estimate
        const coinId = coinIds[idx];
        const prices = sparkData.get(coinId) ?? [];
        const vol = prices.length >= 3 ? calcVolatility(prices) : estimateVolatility(p.sym);

        // Parametric VaR / CVaR (1-day, 95%)
        const var95 = mv * vol.daily * Z_95;
        const cvar95 = mv * vol.daily * Z_CVaR_95;

        return {
          sym: p.sym,
          mv,
          weight,
          volatility: vol.annual,
          dailyVol: vol.daily,
          riskScore: getRiskScore(vol.annual, weight),
          concentration: getConcentration(weight),
          var95,
          cvar95,
        };
      })
      .filter(r => r.mv > 0)
      .sort((a, b) => b.mv - a.mv)
      .slice(0, 10);
  }, [positions, totalMV, getPrice, coinIds, sparkData]);

  const portfolioRisk = useMemo(() => {
    if (assetRisks.length === 0) return { avgVol: 0, hhi: 0, riskLevel: "Low" as const, totalVar: 0, totalCvar: 0 };

    const avgVol = assetRisks.reduce((sum, r) => sum + r.volatility * r.weight, 0);
    const hhi = assetRisks.reduce((sum, r) => sum + r.weight * r.weight, 0);
    // Portfolio VaR (simple sum — conservative, ignores correlation)
    const totalVar = assetRisks.reduce((sum, r) => sum + r.var95, 0);
    const totalCvar = assetRisks.reduce((sum, r) => sum + r.cvar95, 0);

    let riskLevel: "Low" | "Medium" | "High" = "Low";
    if (avgVol > 0.5 || hhi > 0.25) riskLevel = "Medium";
    if (avgVol > 0.7 || hhi > 0.5) riskLevel = "High";

    return { avgVol, hhi, riskLevel, totalVar, totalCvar };
  }, [assetRisks]);

  if (assetRisks.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Per-Asset Risk Breakdown</h2>
        <span
          className="pill"
          style={{
            background: RISK_COLORS[portfolioRisk.riskLevel],
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {portfolioRisk.riskLevel} Risk
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 280 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* Summary metrics */}
        <div style={{
          display: "grid",
          gridTemplateColumns: compact ? "repeat(3, 1fr)" : "repeat(5, 1fr)",
          gap: 1,
          background: "var(--line)",
          borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>AVG VOL</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900 }}>{(portfolioRisk.avgVol * 100).toFixed(1)}%</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>VaR 95%</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900, color: "var(--bad)" }}>{fmtTotal(portfolioRisk.totalVar)}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>HHI</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900 }}>{(portfolioRisk.hhi * 100).toFixed(1)}%</div>
          </div>
          {!compact && (
            <>
              <div style={{ background: "var(--card)", padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600, marginBottom: 3 }}>CVaR 95% 1D</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "var(--bad)" }}>{fmtTotal(portfolioRisk.totalCvar)}</div>
              </div>
              <div style={{ background: "var(--card)", padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600, marginBottom: 3 }}>ASSETS</div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>{assetRisks.length}</div>
              </div>
            </>
          )}
        </div>

        {/* Asset table */}
        <div className="tableWrap">
          <table style={compact ? { fontSize: 10 } : undefined}>
            <thead>
              <tr>
                <th>Asset</th>
                <th style={{ textAlign: "right" }}>Wt%</th>
                <th style={{ textAlign: "right" }}>Vol</th>
                {!compact && <th style={{ textAlign: "right" }}>VaR 95%</th>}
                {!compact && <th style={{ textAlign: "right" }}>CVaR 95%</th>}
                <th style={{ textAlign: "center" }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {assetRisks.slice(0, compact ? 6 : 10).map(r => (
                <tr key={r.sym}>
                  <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{(r.weight * 100).toFixed(1)}%</td>
                  <td className="mono" style={{ textAlign: "right" }}>{(r.volatility * 100).toFixed(0)}%</td>
                  {!compact && <td className="mono" style={{ textAlign: "right", color: "var(--bad)" }}>{fmtTotal(r.var95)}</td>}
                  {!compact && <td className="mono" style={{ textAlign: "right", color: "var(--bad)" }}>{fmtTotal(r.cvar95)}</td>}
                  <td style={{ textAlign: "center" }}>
                    <span className="pill" style={{ fontSize: 8, background: RISK_COLORS[r.riskScore], color: "#fff", fontWeight: 700 }}>{r.riskScore}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
