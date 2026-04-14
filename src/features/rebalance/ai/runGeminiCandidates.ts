/**
 * runGeminiCandidates — Gemini market synthesis and candidate engine.
 *
 * Receives structured portfolio snapshot and proposal context.
 * Gemini synthesizes market regime, evaluates replacement candidates,
 * and recommends either replacement assets or USDT hold.
 *
 * Gemini must NOT decide execution. Output is schema-validated.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  AssetScoreSnapshot,
  PortfolioRiskSnapshot,
  MarketRegime,
  RebalanceAction,
  GeminiReview,
} from '../types/rebalance';
import { extractJSON, validateGeminiOutput, type ValidationResult } from './schemas';

export interface GeminiCandidateInput {
  scores: AssetScoreSnapshot[];
  risk: PortfolioRiskSnapshot;
  regime: MarketRegime;
  proposedActions: RebalanceAction[];
}

/**
 * Build the structured prompt for Gemini.
 */
function buildGeminiPrompt(input: GeminiCandidateInput): string {
  const trimmedAssets = input.proposedActions
    .filter(a => a.action === 'trim' || a.action === 'replace_candidate_review')
    .map(a => a.symbol);

  return `You are a crypto market analyst evaluating replacement candidates for a portfolio rebalance. Use ENGLISH only.

## Your Role
- Synthesize current market regime
- Evaluate potential replacement assets for trimmed positions
- Recommend either specific replacement candidates OR USDT hold
- Provide confidence scores and reasoning for each candidate
- Do NOT decide execution — only recommend
- If no strong candidate exists, recommend hold_usdt

## Portfolio Context
Market Regime: ${input.regime}
HHI: ${(input.risk.hhi * 10000).toFixed(0)}
Concentration Risk: ${input.risk.concentrationRisk}
Top Cluster: ${input.risk.topClusterName} at ${(input.risk.topClusterWeight * 100).toFixed(1)}%

## Current Holdings
${input.scores.map(s => `${s.symbol}: ${(s.currentWeight * 100).toFixed(1)}% weight, score=${s.totalScore.toFixed(3)}`).join('\n')}

## Assets Being Trimmed
${trimmedAssets.length > 0 ? trimmedAssets.join(', ') : 'None'}

## Freed Capital Context
${input.proposedActions.filter(a => a.action === 'trim').map(a => `${a.symbol}: freeing ~${(((a.fromWeight || 0) - (a.toWeight || 0)) * 100).toFixed(1)}%`).join('\n') || 'No capital being freed'}

## Existing Portfolio Clusters to Avoid
Top cluster "${input.risk.topClusterName}" is already at ${(input.risk.topClusterWeight * 100).toFixed(1)}%
DO NOT recommend candidates in the same narrative cluster as overweight positions.

## Required Output Format (JSON only)
{
  "verdict": "replace" | "hold_usdt" | "no_action",
  "confidence": 0.0 to 1.0,
  "marketSummary": {
    "regime": "risk_on" | "neutral" | "risk_off",
    "sentiment": "bearish" | "mixed" | "bullish",
    "breadth": "weak" | "mixed" | "strong"
  },
  "candidates": [
    {
      "symbol": "TICKER",
      "role": "what this asset adds to portfolio",
      "score": 0.0 to 1.0,
      "why": ["reason1", "reason2"],
      "risks": ["risk1", "risk2"]
    }
  ]
}

If recommending hold_usdt, set candidates to an empty array.
Respond with ONLY the JSON object. No markdown, no explanation. All strings must be in ENGLISH.`;
}

/**
 * Call Gemini via Supabase edge function.
 */
export async function runGeminiCandidates(
  input: GeminiCandidateInput,
): Promise<ValidationResult<GeminiReview>> {
  const prompt = buildGeminiPrompt(input);

  try {
    const { data, error } = await supabase.functions.invoke('ai-rebalance-review', {
      body: {
        provider: 'gemini',
        role: 'candidate_engine',
        prompt,
        schema: 'gemini_review',
      },
    });

    if (error) {
      console.error('[runGeminiCandidates] Edge function error:', error);
      return {
        valid: false,
        data: null,
        errors: [`Edge function error: ${error.message}`],
      };
    }

    const responseText = data?.response || data?.result || JSON.stringify(data);
    const parsed = extractJSON(typeof responseText === 'string' ? responseText : JSON.stringify(responseText));

    if (!parsed) {
      return {
        valid: false,
        data: null,
        errors: ['Failed to extract JSON from Gemini response'],
      };
    }

    return validateGeminiOutput(parsed);
  } catch (err) {
    console.error('[runGeminiCandidates] Error:', err);
    return {
      valid: false,
      data: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Cluster mapping for fallback assets.
 */
function clusterOf(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s === 'BTC') return 'store_of_value';
  if (['ETH', 'LINK', 'AAVE', 'ATOM', 'XRP'].includes(s)) return 'smart_contract_platform'; // Simplified for fallback
  if (s === 'USDC') return 'stablecoin';
  return 'other';
}

/**
 * Generate a deterministic fallback when Gemini is unavailable.
 */
export function generateGeminiFallback(input: GeminiCandidateInput): GeminiReview {
  const heldSymbols = new Set(input.scores.map(s => s.symbol.toUpperCase()));
  const dominantCluster = (input.risk.topClusterName || '').toLowerCase();

  const universe = [
    { symbol: 'BTC', role: 'Primary store of value and market anchor', score: 0.85, why: ['High liquidity', 'Market leader'], risks: ['High volatility'] },
    { symbol: 'ETH', role: 'Leading smart contract platform', score: 0.82, why: ['Network effects', 'Institutional adoption'], risks: ['Regulatory uncertainty'] },
    { symbol: 'LINK', role: 'Essential oracle infrastructure', score: 0.78, why: ['Dominant oracle', 'Integrations'], risks: ['Competition'] },
    { symbol: 'AAVE', role: 'Top tier DeFi lending protocol', score: 0.75, why: ['Governance maturity', 'High TVL'], risks: ['Smart contract risk'] },
    { symbol: 'ATOM', role: 'Interoperability backbone', score: 0.72, why: ['Cosmos ecosystem', 'Hub utility'], risks: ['Staking dilution'] },
    { symbol: 'XRP', role: 'Payment and liquidity bridge', score: 0.70, why: ['Fast settlement', 'Banking partnerships'], risks: ['Legal developments'] },
    { symbol: 'USDC', role: 'Regulated stablecoin preservation', score: 0.95, why: ['Capital safety', 'High trust'], risks: ['Centralization'] }
  ];

  // Filter out assets already held or in the dominant cluster
  const candidates = universe
    .filter(c => !heldSymbols.has(c.symbol))
    .filter(c => clusterOf(c.symbol).toLowerCase() !== dominantCluster)
    .slice(0, 3);

  return {
    verdict: candidates.length > 0 ? 'replace' : 'hold_usdt',
    confidence: 0.5,
    marketSummary: {
      regime: input.regime,
      sentiment: 'mixed',
      breadth: 'mixed',
    },
    candidates: candidates,
  };
}
