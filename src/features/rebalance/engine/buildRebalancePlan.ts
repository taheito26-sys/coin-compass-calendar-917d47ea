/**
 * buildRebalancePlan — Deterministic rebalance action generator.
 *
 * Reads asset scores + portfolio risk to generate actions:
 *   trim | hold | park_usdt | replace_candidate_review | no_action
 *
 * NEVER generates direct buy/execute actions.
 * All replacement candidates require human review.
 */

import type {
  AssetScoreSnapshot,
  PortfolioRiskSnapshot,
  MarketRegime,
  RebalanceAction,
  RiskGuardConfig,
} from '../types/rebalance';
import { DEFAULT_RISK_GUARD_CONFIG } from '../types/rebalance';

interface PlanInput {
  scores: AssetScoreSnapshot[];
  risk: PortfolioRiskSnapshot;
  regime: MarketRegime;
  config: RiskGuardConfig;
}

/**
 * Build a deterministic rebalance plan.
 * Returns a list of actions that should be taken subject to AI review and human approval.
 */
export function buildRebalancePlan(input: PlanInput): RebalanceAction[] {
  const { scores, risk, regime, config } = input;
  const actions: RebalanceAction[] = [];

  // If portfolio is not concentrated and regime is neutral/risk_on → no action needed
  if (risk.concentrationRisk === 'low' && regime === 'risk_on') {
    return [
      {
        action: 'no_action',
        symbol: 'PORTFOLIO',
        reasonCodes: ['portfolio_balanced', 'regime_favorable'],
      },
    ];
  }

  for (const asset of scores) {
    const reasons: string[] = [];
    let shouldTrim = false;
    let suggestParkUsdt = false;
    let suggestReplacementReview = false;

    // ─── Check concentration violations ──────────────────────────────────
    if (asset.currentWeight > config.maxSingleAssetWeight) {
      shouldTrim = true;
      reasons.push(
        `weight_exceeds_max:${(asset.currentWeight * 100).toFixed(1)}%>${(config.maxSingleAssetWeight * 100).toFixed(0)}%`,
      );
    }

    // ─── Check score-based trim signals ──────────────────────────────────
    if (asset.totalScore < 0.10) {
      shouldTrim = true;
      reasons.push(`low_total_score:${asset.totalScore.toFixed(3)}`);
    }

    if (asset.pumpRiskScore > config.maxPumpRiskToBuy) {
      shouldTrim = true;
      reasons.push(`high_pump_risk:${asset.pumpRiskScore.toFixed(2)}`);
    }

    if (asset.liquidityScore < config.minLiquidityScore && asset.currentWeight > 0.05) {
      shouldTrim = true;
      reasons.push(`low_liquidity:${asset.liquidityScore.toFixed(2)}`);
    }

    // ─── Regime-based adjustments ────────────────────────────────────────
    if (regime === 'risk_off') {
      // In risk-off, trim any asset with below-average score
      const avgScore = scores.reduce((s, a) => s + a.totalScore, 0) / scores.length;
      if (asset.totalScore < avgScore * 0.7) {
        shouldTrim = true;
        reasons.push('below_avg_in_risk_off');
      }
      // Prefer parking in USDT during risk-off
      suggestParkUsdt = true;
    }

    // ─── Concentration penalty trigger ───────────────────────────────────
    if (asset.concentrationPenalty > 0.6) {
      shouldTrim = true;
      reasons.push(`high_concentration_penalty:${asset.concentrationPenalty.toFixed(2)}`);
    }

    // ─── Correlation penalty trigger ─────────────────────────────────────
    if (asset.correlationPenalty > 0.7) {
      shouldTrim = true;
      reasons.push(`high_correlation_penalty:${asset.correlationPenalty.toFixed(2)}`);
    }

    // ─── Generate action ─────────────────────────────────────────────────
    if (shouldTrim) {
      const targetWeight = Math.min(
        asset.currentWeight,
        config.maxSingleAssetWeight * 0.8, // trim to 80% of max to give buffer
      );

      actions.push({
        action: 'trim',
        symbol: asset.symbol,
        fromWeight: asset.currentWeight,
        toWeight: Math.max(0, targetWeight),
        reasonCodes: reasons,
      });

      // Determine what to do with freed capital
      if (suggestParkUsdt || regime === 'risk_off') {
        actions.push({
          action: 'park_usdt',
          symbol: 'USDT',
          fromWeight: 0,
          toWeight: asset.currentWeight - targetWeight,
          reasonCodes: ['freed_capital_park', ...reasons.slice(0, 2)],
        });
      } else {
        // In neutral/risk-on, suggest looking for replacements
        actions.push({
          action: 'replace_candidate_review',
          symbol: asset.symbol,
          fromWeight: asset.currentWeight,
          toWeight: targetWeight,
          reasonCodes: ['seek_replacement_candidate', ...reasons.slice(0, 2)],
        });
      }
    } else {
      actions.push({
        action: 'hold',
        symbol: asset.symbol,
        reasonCodes: ['passes_all_checks'],
      });
    }
  }

  // If no trims were generated but concentration is elevated, add advisory
  const hasTrms = actions.some(a => a.action === 'trim');
  if (!hasTrms && (risk.concentrationRisk === 'medium' || risk.concentrationRisk === 'high')) {
    actions.unshift({
      action: 'no_action',
      symbol: 'PORTFOLIO',
      reasonCodes: [
        `concentration_${risk.concentrationRisk}_but_no_trim_triggered`,
        'review_individual_positions',
      ],
    });
  }

  return actions;
}
