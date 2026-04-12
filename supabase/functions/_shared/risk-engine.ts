import type { PortfolioSnapshot } from "./portfolio-snapshot.ts";

export interface RiskMetrics {
  overallRiskLevel: string;
  diversificationScore: number;
  concentrationRisk: number;
  maxAssetWeight: number;
  maxAssetSymbol: string;
  hhi: number;
  stablecoinRatio: number;
  warnings: Array<{ type: string; severity: string; message: string }>;
}

export function calculateRiskMetrics(snapshot: PortfolioSnapshot): RiskMetrics {
  const warnings: Array<{ type: string; severity: string; message: string }> = [];
  const holdings = snapshot.holdings.filter(h => h.marketValue > 0);

  if (holdings.length === 0) {
    return {
      overallRiskLevel: "low", diversificationScore: 0, concentrationRisk: 0,
      maxAssetWeight: 0, maxAssetSymbol: "N/A", hhi: 0,
      stablecoinRatio: snapshot.stablecoinRatio,
      warnings: [{ type: "empty", severity: "low", message: "No holdings detected" }],
    };
  }

  let hhi = 0, maxWeight = 0, maxSymbol = "";
  for (const h of holdings) {
    const w = h.weight * 100;
    hhi += w * w;
    if (h.weight > maxWeight) { maxWeight = h.weight; maxSymbol = h.symbol; }
  }

  if (maxWeight > 0.4) {
    warnings.push({ type: "concentration", severity: "high",
      message: `${maxSymbol} represents ${(maxWeight * 100).toFixed(1)}% of portfolio — exceeds 40% threshold` });
  } else if (maxWeight > 0.3) {
    warnings.push({ type: "concentration", severity: "medium",
      message: `${maxSymbol} at ${(maxWeight * 100).toFixed(1)}% — approaching concentration limit` });
  }

  const maxHhi = 10000;
  const minHhi = holdings.length > 0 ? 10000 / holdings.length : 10000;
  const diversificationScore = Math.max(0, Math.min(100, ((maxHhi - hhi) / (maxHhi - minHhi)) * 100));

  if (snapshot.stablecoinRatio > 0.5) {
    warnings.push({ type: "idle_capital", severity: "medium",
      message: `${(snapshot.stablecoinRatio * 100).toFixed(1)}% in stablecoins — consider deployment strategy` });
  }

  let overallRiskLevel = "low";
  if (maxWeight > 0.5 || hhi > 4000) overallRiskLevel = "high";
  else if (maxWeight > 0.3 || hhi > 2500) overallRiskLevel = "medium";

  return {
    overallRiskLevel, diversificationScore: Math.round(diversificationScore),
    concentrationRisk: maxWeight, maxAssetWeight: maxWeight, maxAssetSymbol: maxSymbol,
    hhi: Math.round(hhi), stablecoinRatio: snapshot.stablecoinRatio, warnings,
  };
}