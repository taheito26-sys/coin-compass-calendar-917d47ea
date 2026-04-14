/**
 * getRebalanceAnalysis — API layer for triggering rebalance analysis.
 *
 * Orchestrates: signal collection → asset scoring → portfolio risk →
 * rebalance plan → risk guards → AI reviews → consensus
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  AssetSignalInput,
  AssetScoreSnapshot,
  PortfolioRiskSnapshot,
  RebalanceAction,
  ConsensusResult,
  ClaudeReview,
  GeminiReview,
  RiskGuardConfig,
  MarketRegime,
} from '../types/rebalance';
import { DEFAULT_RISK_GUARD_CONFIG } from '../types/rebalance';
import { detectMarketRegime, type RegimeResult } from '../engine/detectMarketRegime';
import { computeAssetScores } from '../engine/computeAssetScores';
import { computePortfolioRisk } from '../engine/computePortfolioRisk';
import { buildRebalancePlan } from '../engine/buildRebalancePlan';
import { enforceRiskGuards, type RiskGuardResult } from '../engine/enforceRiskGuards';
import { runClaudeReview, generateClaudeFallback } from '../ai/runClaudeReview';
import { runGeminiCandidates, generateGeminiFallback } from '../ai/runGeminiCandidates';
import { mergeConsensus } from '../ai/mergeConsensus';

export interface RebalanceAnalysisResult {
  runId: string | null;
  regime: RegimeResult;
  scores: AssetScoreSnapshot[];
  portfolioRisk: PortfolioRiskSnapshot;
  rawActions: RebalanceAction[];
  riskGuardResult: RiskGuardResult;
  claudeReview: ClaudeReview | null;
  geminiReview: GeminiReview | null;
  consensus: ConsensusResult;
  errors: string[];
  timestamp: string;
}

/**
 * Infer a narrative cluster for a symbol if not provided.
 */
function inferNarrativeCluster(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'BTC') return 'store_of_value';
  if (['ETH', 'SOL', 'AVAX', 'DOT', 'ADA', 'MATIC', 'SUI', 'APT', 'NEAR'].includes(s)) return 'smart_contract_platform';
  if (s === 'TON') return 'consumer_network';
  if (['INJ', 'UNI', 'AAVE', 'MKR'].includes(s)) return 'defi';
  if (s === 'LINK') return 'oracle_infrastructure';
  if (['RENDER', 'RNDR'].includes(s)) return 'depin_ai';
  if (['FET', 'TAO'].includes(s)) return 'ai';
  if (['QNT', 'ATOM'].includes(s)) return 'interop';
  if (['XRP', 'XLM'].includes(s)) return 'payment';
  if (['USDT', 'USDC', 'DAI'].includes(s)) return 'stablecoin';
  return 'other';
}

/**
 * Build signal inputs from the user's live portfolio data.
 */
export function buildSignalInputs(
  positions: Array<{
    sym: string;
    qty: number;
    price: number | null;
    cost: number;
    avg: number;
    change1h?: number;
    change24h?: number;
    change7d?: number;
    marketCap?: number;
    volume?: number;
    narrativeCluster?: string;
  }>,
  totalMV: number,
): AssetSignalInput[] {
  return positions
    .filter(p => p.price !== null && p.price > 0 && p.qty > 0)
    .map(p => {
      const mv = (p.price || 0) * p.qty;
      const weight = totalMV > 0 ? mv / totalMV : 0;
      const pnlPct = p.cost > 0 ? ((mv - p.cost) / p.cost) * 100 : 0;
      // Estimate volatility from available data
      const vol7d = Math.abs(p.change7d || 0) * 2; // rough proxy
      const vol30d = vol7d * 1.5;

      return {
        symbol: p.sym,
        weight,
        pnlPct,
        price: p.price || 0,
        marketCap: p.marketCap || 0,
        volume24h: p.volume || 0,
        volatility7d: vol7d,
        volatility30d: vol30d,
        change1h: p.change1h || 0,
        change24h: p.change24h || 0,
        change7d: p.change7d || 0,
        narrativeCluster: p.narrativeCluster || inferNarrativeCluster(p.sym),
      };
    });
}

/**
 * Run the full rebalance analysis pipeline.
 */
export async function getRebalanceAnalysis(
  signalInputs: AssetSignalInput[],
  config: RiskGuardConfig = DEFAULT_RISK_GUARD_CONFIG,
  options: { skipAI?: boolean } = {},
): Promise<RebalanceAnalysisResult> {
  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  // ─── Phase 1: Deterministic analysis ───────────────────────────────────
  const regime = detectMarketRegime(signalInputs);
  const scores = computeAssetScores(signalInputs);
  const portfolioRisk = computePortfolioRisk(signalInputs, regime.regime);
  const rawActions = buildRebalancePlan({
    scores,
    risk: portfolioRisk,
    regime: regime.regime,
    config,
  });

  // ─── Phase 2: Risk guard enforcement (pre-AI) ─────────────────────────
  const riskGuardResult = enforceRiskGuards(
    rawActions,
    [], // No candidates yet
    scores,
    portfolioRisk,
    config,
  );

  // ─── Phase 3: AI reviews (Claude + Gemini in parallel) ─────────────────
  let claudeReview: ClaudeReview | null = null;
  let geminiReview: GeminiReview | null = null;

  if (!options.skipAI) {
    const aiInput = {
      scores,
      risk: portfolioRisk,
      regime: regime.regime,
      proposedActions: riskGuardResult.filteredActions,
    };

    const [claudeResult, geminiResult] = await Promise.allSettled([
      runClaudeReview(aiInput),
      runGeminiCandidates(aiInput),
    ]);

    // Process Claude result
    if (claudeResult.status === 'fulfilled') {
      if (claudeResult.value.valid && claudeResult.value.data) {
        claudeReview = claudeResult.value.data;
      } else {
        errors.push(`Claude validation failed: ${claudeResult.value.errors.join('; ')}`);
        claudeReview = generateClaudeFallback(aiInput);
      }
    } else {
      errors.push(`Claude error: ${claudeResult.reason}`);
      claudeReview = generateClaudeFallback(aiInput);
    }

    // Process Gemini result
    if (geminiResult.status === 'fulfilled') {
      if (geminiResult.value.valid && geminiResult.value.data) {
        geminiReview = geminiResult.value.data;
      } else {
        errors.push(`Gemini validation failed: ${geminiResult.value.errors.join('; ')}`);
        geminiReview = generateGeminiFallback(aiInput);
      }
    } else {
      errors.push(`Gemini error: ${geminiResult.reason}`);
      geminiReview = generateGeminiFallback(aiInput);
    }
  }

  // ─── Phase 4: Consensus ────────────────────────────────────────────────
  const consensus = mergeConsensus({
    deterministicActions: riskGuardResult.filteredActions,
    claudeReview,
    geminiReview,
  });

  // ─── Phase 5: Final risk guard pass (with candidates this time) ────────
  if (consensus.candidates.length > 0) {
    const finalGuard = enforceRiskGuards(
      consensus.finalActions,
      consensus.candidates,
      scores,
      portfolioRisk,
      config,
    );
    consensus.finalActions = finalGuard.filteredActions;
    consensus.candidates = finalGuard.filteredCandidates;
    if (!finalGuard.passed) {
      errors.push('Final risk guard pass blocked some actions');
    }
  }

  // ─── Persist to DB ─────────────────────────────────────────────────────
  let runId: string | null = null;
  try {
    const { data: runData, error: runError } = await supabase
      .from('rebalance_runs')
      .insert({
        regime: regime.regime,
        hhi: portfolioRisk.hhi,
        top_holding_weight: portfolioRisk.topHoldingWeight,
        top_cluster_weight: portfolioRisk.topClusterWeight,
        concentration_risk: portfolioRisk.concentrationRisk,
        deterministic_recommendation: rawActions,
        status: 'analysis_complete',
      })
      .select('id')
      .single();

    if (runError) {
      console.warn('[getRebalanceAnalysis] DB insert failed:', runError.message);
      errors.push(`DB: ${runError.message}`);
    } else {
      runId = runData?.id || null;
    }

    // Persist asset snapshots
    if (runId) {
      const snapshots = scores.map(s => ({
        run_id: runId!,
        symbol: s.symbol,
        weight: s.currentWeight,
        pnl_pct: s.pnlPct,
        volatility_7d: s.volatility7d,
        volatility_30d: s.volatility30d,
        liquidity_score: s.liquidityScore,
        sentiment_score: s.sentimentScore,
        whale_score: s.whaleScore,
        pump_risk_score: s.pumpRiskScore,
        breadth_fit_score: s.breadthFitScore,
        correlation_penalty: s.correlationPenalty,
        concentration_penalty: s.concentrationPenalty,
        conviction_score: s.convictionScore,
        total_score: s.totalScore,
      }));

      const { error: snapErr } = await supabase
        .from('asset_signal_snapshots')
        .insert(snapshots);
      if (snapErr) errors.push(`DB snapshots: ${snapErr.message}`);

      // Persist AI opinions
      if (claudeReview) {
        await supabase.from('ai_rebalance_opinions').insert({
          run_id: runId,
          provider: 'claude',
          role: 'risk_critic',
          verdict: claudeReview.verdict,
          confidence: claudeReview.confidence,
          payload_json: claudeReview,
        });
      }
      if (geminiReview) {
        await supabase.from('ai_rebalance_opinions').insert({
          run_id: runId,
          provider: 'gemini',
          role: 'candidate_engine',
          verdict: geminiReview.verdict,
          confidence: geminiReview.confidence,
          payload_json: geminiReview,
        });
      }

      // Persist actions
      const actionRows = consensus.finalActions.map(a => ({
        run_id: runId!,
        symbol: a.symbol,
        action: a.action,
        from_weight: a.fromWeight ?? null,
        to_weight: a.toWeight ?? null,
        execution_mode: 'manual',
        status: 'proposed',
        reason_codes: a.reasonCodes,
      }));

      const { error: actErr } = await supabase
        .from('rebalance_actions')
        .insert(actionRows);
      if (actErr) errors.push(`DB actions: ${actErr.message}`);
    }
  } catch (err) {
    errors.push(`DB error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    runId,
    regime,
    scores,
    portfolioRisk,
    rawActions,
    riskGuardResult,
    claudeReview,
    geminiReview,
    consensus,
    errors,
    timestamp,
  };
}
