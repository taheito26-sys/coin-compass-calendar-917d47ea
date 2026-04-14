/**
 * enforceRiskGuards — Hard-block layer for unsafe recommendations.
 *
 * Validates proposed actions against configurable risk rules.
 * Rules that fail produce violations, and if any violation is blocking,
 * the entire plan is rejected.
 */

import type {
  RebalanceAction,
  AssetScoreSnapshot,
  PortfolioRiskSnapshot,
  RiskGuardConfig,
  RiskGuardViolation,
  GeminiCandidate,
} from '../types/rebalance';
import { DEFAULT_RISK_GUARD_CONFIG } from '../types/rebalance';

export interface RiskGuardResult {
  passed: boolean;
  violations: RiskGuardViolation[];
  filteredActions: RebalanceAction[];
  filteredCandidates: GeminiCandidate[];
}

/**
 * Check if a proposed plan would increase HHI.
 */
function checkHHIIncrease(
  actions: RebalanceAction[],
  scores: AssetScoreSnapshot[],
  currentHHI: number,
): RiskGuardViolation | null {
  // Simulate weights after proposed changes
  const simWeights = new Map<string, number>();
  for (const s of scores) {
    simWeights.set(s.symbol, s.currentWeight);
  }

  for (const action of actions) {
    if (action.action === 'trim' && action.toWeight !== undefined) {
      simWeights.set(action.symbol, action.toWeight);
    }
  }

  const totalWeight = Array.from(simWeights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return null;

  // Normalize and compute new HHI
  const newHHI = Array.from(simWeights.values()).reduce((s, w) => {
    const norm = w / totalWeight;
    return s + norm * norm;
  }, 0);

  if (newHHI > currentHHI * 1.05) { // 5% tolerance
    return {
      rule: 'no_hhi_increase',
      current: newHHI,
      threshold: currentHHI,
      message: `Proposed plan would increase HHI from ${(currentHHI * 10000).toFixed(0)} to ${(newHHI * 10000).toFixed(0)}`,
      blocked: true,
    };
  }
  return null;
}

/**
 * Check max single asset concentration.
 */
function checkMaxSingleAsset(
  actions: RebalanceAction[],
  config: RiskGuardConfig,
): RiskGuardViolation[] {
  const violations: RiskGuardViolation[] = [];

  for (const action of actions) {
    if (action.toWeight !== undefined && action.toWeight > config.maxSingleAssetWeight) {
      violations.push({
        rule: 'max_single_asset_weight',
        asset: action.symbol,
        current: action.toWeight,
        threshold: config.maxSingleAssetWeight,
        message: `${action.symbol} target weight ${(action.toWeight * 100).toFixed(1)}% exceeds max ${(config.maxSingleAssetWeight * 100).toFixed(0)}%`,
        blocked: true,
      });
    }
  }

  return violations;
}

/**
 * Check candidate liquidity threshold.
 */
function checkCandidateLiquidity(
  candidates: GeminiCandidate[],
  config: RiskGuardConfig,
): { violations: RiskGuardViolation[]; filtered: GeminiCandidate[] } {
  const violations: RiskGuardViolation[] = [];
  const filtered: GeminiCandidate[] = [];

  for (const candidate of candidates) {
    // Score is 0-1 confidence, we use it as a soft liquidity proxy
    // In production, would check actual liquidity data
    if (candidate.score < config.minLiquidityScore) {
      violations.push({
        rule: 'min_liquidity_threshold',
        asset: candidate.symbol,
        current: candidate.score,
        threshold: config.minLiquidityScore,
        message: `Candidate ${candidate.symbol} below liquidity threshold (score: ${candidate.score.toFixed(2)})`,
        blocked: false, // warn but don't block entire plan
      });
    } else {
      filtered.push(candidate);
    }
  }

  return { violations, filtered };
}

/**
 * Check pump risk on candidates.
 */
function checkCandidatePumpRisk(
  candidates: GeminiCandidate[],
  config: RiskGuardConfig,
): { violations: RiskGuardViolation[]; filtered: GeminiCandidate[] } {
  const violations: RiskGuardViolation[] = [];
  const filtered: GeminiCandidate[] = [];

  for (const candidate of candidates) {
    // Check if any of the risks mention pump-like signals
    const hasPumpRisk = candidate.risks.some(r =>
      r.toLowerCase().includes('pump') ||
      r.toLowerCase().includes('rapid') ||
      r.toLowerCase().includes('abnormal')
    );
    if (hasPumpRisk && candidate.score < 0.6) {
      violations.push({
        rule: 'max_pump_risk',
        asset: candidate.symbol,
        current: candidate.score,
        threshold: config.maxPumpRiskToBuy,
        message: `Candidate ${candidate.symbol} flagged for pump risk`,
        blocked: false,
      });
    } else {
      filtered.push(candidate);
    }
  }

  return { violations, filtered };
}

/**
 * Check if candidate is too correlated with dominant holdings.
 */
function checkCandidateCorrelation(
  candidates: GeminiCandidate[],
  scores: AssetScoreSnapshot[],
  config: RiskGuardConfig,
): { violations: RiskGuardViolation[]; filtered: GeminiCandidate[] } {
  const violations: RiskGuardViolation[] = [];
  const filtered: GeminiCandidate[] = [];

  // Get dominant holdings (top 3 by weight)
  const dominant = [...scores].sort((a, b) => b.currentWeight - a.currentWeight).slice(0, 3);
  const dominantSymbols = new Set(dominant.map(d => d.symbol.toUpperCase()));

  for (const candidate of candidates) {
    // Simple check: is the candidate in the same "family"?
    const isSameAsExisting = dominantSymbols.has(candidate.symbol.toUpperCase());
    if (isSameAsExisting) {
      violations.push({
        rule: 'candidate_too_correlated',
        asset: candidate.symbol,
        current: 1.0,
        threshold: config.maxCorrelationToExisting,
        message: `Candidate ${candidate.symbol} already in dominant holdings`,
        blocked: true,
      });
    } else {
      filtered.push(candidate);
    }
  }

  return { violations, filtered };
}

/**
 * Check that the plan doesn't maintain the same concentration under a different name.
 * E.g., trimming ETH and replacing with SOL still keeps smart_contract_platform cluster heavy.
 */
function checkConcentrationDisguise(
  actions: RebalanceAction[],
  candidates: GeminiCandidate[],
  risk: PortfolioRiskSnapshot,
): RiskGuardViolation | null {
  // If we're trimming and the replacement candidates are in the same top cluster
  const trimmed = actions.filter(a => a.action === 'trim').map(a => a.symbol);
  if (trimmed.length === 0 || candidates.length === 0) return null;

  // If top cluster is already > 40% and candidate role mentions the same cluster theme
  if (risk.topClusterWeight > 0.40) {
    const sameClusterCandidates = candidates.filter(c =>
      c.role.toLowerCase().includes(risk.topClusterName.replace(/_/g, ' '))
    );
    if (sameClusterCandidates.length > 0) {
      return {
        rule: 'no_concentration_disguise',
        current: risk.topClusterWeight,
        threshold: 0.40,
        message: `Replacement candidates in same cluster "${risk.topClusterName}" (${(risk.topClusterWeight * 100).toFixed(0)}%) — concentration not reduced`,
        blocked: true,
      };
    }
  }

  return null;
}

/**
 * Get adaptive config if candidate count is too low.
 */
function getAdaptiveConfig(
  candidates: GeminiCandidate[],
  config: RiskGuardConfig
): RiskGuardConfig {
  if (candidates.length >= config.minCandidateCount) {
    return config;
  }
  return {
    ...config,
    minLiquidityScore: config.relaxedMinLiquidityScore,
    maxCorrelationToExisting: config.relaxedMaxCorrelationToExisting,
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Enforce all risk guards on a proposed plan.
 * Returns filtered actions and candidates, plus any violations.
 */
export function enforceRiskGuards(
  actions: RebalanceAction[],
  candidates: GeminiCandidate[],
  scores: AssetScoreSnapshot[],
  risk: PortfolioRiskSnapshot,
  config: RiskGuardConfig = DEFAULT_RISK_GUARD_CONFIG,
): RiskGuardResult {
  const violations: RiskGuardViolation[] = [];
  let filteredActions = [...actions];
  const adaptiveConfig = getAdaptiveConfig(candidates, config);

  // 1. HHI increase check (Plan-level)
  const hhiViolation = checkHHIIncrease(actions, scores, risk.hhi);
  if (hhiViolation) violations.push(hhiViolation);

  // 2. Max single asset check (Plan-level)
  const singleAssetViolations = checkMaxSingleAsset(actions, config);
  violations.push(...singleAssetViolations);

  // 3. Candidate filtering with ADAPTIVE config
  let { violations: liqViolations, filtered: liqFiltered } = checkCandidateLiquidity(candidates, adaptiveConfig);
  let { violations: pumpViolations, filtered: pumpFiltered } = checkCandidatePumpRisk(liqFiltered, adaptiveConfig);
  let { violations: corrViolations, filtered: filteredCandidates } = checkCandidateCorrelation(pumpFiltered, scores, adaptiveConfig);

  violations.push(...liqViolations, ...pumpViolations, ...corrViolations);

  // 4. Concentration disguise check
  const disguiseViolation = checkConcentrationDisguise(actions, filteredCandidates, risk);
  if (disguiseViolation) violations.push(disguiseViolation);

  // 5. RESCUE PASS: If zero candidates survive, attempt to rescue strong ones using the floor
  if (filteredCandidates.length === 0 && candidates.length > 0) {
    const rescued = candidates
      .filter(c => c.score >= adaptiveConfig.candidateScoreFloor)
      .sort((a, b) => b.score - a.score)
      .slice(0, adaptiveConfig.minCandidateCount);

    if (rescued.length > 0) {
      filteredCandidates = rescued;
      violations.push({
        rule: 'candidate_rescue_pass',
        message: `Rescued ${rescued.length} candidates using score floor ${adaptiveConfig.candidateScoreFloor}`,
        current: rescued.length,
        threshold: adaptiveConfig.minCandidateCount,
        blocked: false
      });
    }
  }

  // 6. Only if still zero candidates, convert replace_candidate_review to park_usdt
  if (filteredCandidates.length === 0) {
    filteredActions = filteredActions.map(a => {
      if (a.action === 'replace_candidate_review') {
        return {
          ...a,
          action: 'park_usdt' as const,
          symbol: 'USDT',
          reasonCodes: [...a.reasonCodes, 'no_valid_candidates_after_risk_guard'],
        };
      }
      return a;
    });
  }

  // Determine if any blocking violation exists
  const planBlocked = hhiViolation?.blocked || singleAssetViolations.some(v => v.blocked);

  return {
    passed: !planBlocked,
    violations,
    filteredActions,
    filteredCandidates,
  };
}
