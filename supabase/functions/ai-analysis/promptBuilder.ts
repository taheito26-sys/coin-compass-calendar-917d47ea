import type { PortfolioSnapshot } from "./portfolioSnapshot.ts";
import type { RiskMetrics } from "./riskEngine.ts";

export function buildPrompt(
  snapshot: PortfolioSnapshot,
  risk: RiskMetrics,
  analysisType: string,
  riskProfile: string
): string {
  const holdingsSummary = snapshot.holdings
    .filter(h => h.marketValue > 0)
    .map(h => ({
      symbol: h.symbol,
      qty: h.qty,
      avgCost: Math.round(h.avgCost * 100) / 100,
      currentPrice: Math.round(h.currentPrice * 100) / 100,
      marketValue: Math.round(h.marketValue * 100) / 100,
      pnlPct: Math.round(h.pnlPct * 100) / 100,
      weight: Math.round(h.weight * 10000) / 100,
    }));

  const systemPrompt = `You are a portfolio risk analyst. You analyze crypto portfolios and provide structured recommendations.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown. No prose outside JSON.
- Do not claim certainty. Use words like "may", "suggests", "consider".
- Do not invent data not provided.
- Do not recommend leverage.
- Do not recommend allocations exceeding risk limits.
- Base analysis ONLY on the provided data.
- All recommendations are advisory, not executable instructions.

RISK PROFILE: ${riskProfile}
- conservative: max 25% single asset, prefer hold/DCA, avoid aggressive buys
- moderate: max 35% single asset, balanced approach
- aggressive: max 45% single asset, higher risk tolerance

ANALYSIS TYPE: ${analysisType}

PORTFOLIO DATA:
Total Value: $${snapshot.totalValue.toFixed(2)}
Total Cost Basis: $${snapshot.totalCost.toFixed(2)}
Cash (USDT): $${snapshot.cashUsdt.toFixed(2)}
Stablecoin Ratio: ${(snapshot.stablecoinRatio * 100).toFixed(1)}%

HOLDINGS:
${JSON.stringify(holdingsSummary, null, 2)}

RISK METRICS:
Overall Risk Level: ${risk.overallRiskLevel}
Diversification Score: ${risk.diversificationScore}/100
Max Asset Weight: ${risk.maxAssetSymbol} at ${(risk.maxAssetWeight * 100).toFixed(1)}%
HHI: ${risk.hhi}

CURRENT WARNINGS:
${risk.warnings.map(w => `- [${w.severity}] ${w.message}`).join("\n")}

REQUIRED OUTPUT SCHEMA:
{
  "recommendations": [
    {
      "action": "buy" | "sell" | "hold",
      "asset": "SYMBOL",
      "confidence": 0.0 to 1.0,
      "priority": "low" | "medium" | "high",
      "reason": {
        "market": "market-based reasoning",
        "portfolio": "portfolio-based reasoning",
        "risk": "risk-based reasoning"
      }
    }
  ],
  "rebalancePlan": [
    {
      "asset": "SYMBOL",
      "currentAllocation": number,
      "targetAllocation": number,
      "delta": number
    }
  ],
  "warnings": [
    {
      "type": "string",
      "severity": "low" | "medium" | "high",
      "message": "string"
    }
  ]
}

Analyze the portfolio and return ONLY the JSON object above. Every field is required.`;

  return systemPrompt;
}
