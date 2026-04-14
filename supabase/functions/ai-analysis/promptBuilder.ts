import type { PortfolioSnapshot } from "./portfolioSnapshot.ts";
import type { RiskMetrics } from "./riskEngine.ts";
import type { MarketSignals } from "./signalEngine.ts";

export function buildPrompt(
  snapshot: PortfolioSnapshot,
  risk: RiskMetrics,
  signals: MarketSignals,
  riskProfile: string
): string {
  const holdingsSummary = snapshot.holdings
    .filter(h => h.marketValue > 0)
    .map(h => ({
      symbol: h.symbol,
      weight: Math.round(h.weight * 10000) / 100,
      pnlPct: Math.round(h.pnlPct * 100) / 100,
    }));

  const systemPrompt = `You are a high-level crypto investment analyst and risk manager.
Your task is to provide a 360-degree market analysis and portfolio decision in ARABIC.

INTERNAL ANALYSIS CONTEXT (DO NOT OUTPUT DIRECTLY):
1. Market Regime: ${signals.marketRegime}
2. Sentiment: ${signals.sentiment.label} (Score: ${signals.sentiment.score})
3. Whale Behavior: Acc: ${signals.whaleActivity.accumulation.join(", ")}, Dist: ${signals.whaleActivity.distribution.join(", ")}
4. Momentum: Pos: ${signals.momentum.positive.join(", ")}, Neg: ${signals.momentum.negative.join(", ")}
5. Pump Risk: ${signals.pumpRisk.highRiskAssets.join(", ")}
6. Concentration: Max: ${risk.maxAssetSymbol} at ${(risk.maxAssetWeight * 100).toFixed(1)}%, HHI: ${risk.hhi}
7. Portfolio Value: $${snapshot.totalValue.toFixed(2)}, Cash (USDT): $${snapshot.cashUsdt.toFixed(2)}
8. Target Risk Profile: ${riskProfile}

OUTPUT RULES (NON-NEGOTIABLE):
- Response MUST be in ARABIC only.
- Response MUST be a valid JSON object matching the schema below.
- ALL user-facing text must be SHORT, SHARP, and DECISION-FOCUSED.
- Total word count should be between 25 and 70 Arabic words.
- Avoid disclaimers, repeated reasoning, or filler words.
- Treat USDT as a valid defensive option if the market is too risky.

REQUIRED OUTPUT SCHEMA:
{
  "marketState": { 
    "regime": "risk_on" | "neutral" | "risk_off", 
    "summary_ar": "Short Arabic summary of market regime" 
  },
  "risk": { 
    "primary_ar": "Identify the primary risk (concentration, volatility, etc.) in Arabic" 
  },
  "decision": { 
    "action_ar": "Explicit decision/action recommendation in Arabic (e.g., hold USDT, rotate, trim)" 
  },
  "opportunity": { 
    "replacement_ar": "Identify potential candidates or 'No strong opportunity' in Arabic" 
  },
  "compactSummary": { 
    "text_ar": "A final 1-2 line Arabic summary concluding the analysis" 
  }
}

HOLDINGS DATA:
${JSON.stringify(holdingsSummary)}

CURRENT RISK WARNINGS FROM ENGINE:
${risk.warnings.map(w => `- ${w.message}`).join("\n")}

Respond ONLY with the JSON object. Keep it concise.`;

  return systemPrompt;
}
