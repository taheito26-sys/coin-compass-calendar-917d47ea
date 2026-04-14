/**
 * runClaudeReview — Claude risk critic layer.
 *
 * Receives structured portfolio snapshot + deterministic proposal.
 * Claude challenges the proposal, finds risks, may veto low-quality plans.
 * Output is schema-validated; invalid output is rejected entirely.
 *
 * Claude must NOT invent actions outside the schema.
 * Claude PREFERS USDT parking over weak forced rotation.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  AssetScoreSnapshot,
  PortfolioRiskSnapshot,
  MarketRegime,
  RebalanceAction,
  ClaudeReview,
} from '../types/rebalance';
import { extractJSON, validateClaudeOutput, type ValidationResult } from './schemas';

export interface ClaudeReviewInput {
  scores: AssetScoreSnapshot[];
  risk: PortfolioRiskSnapshot;
  regime: MarketRegime;
  proposedActions: RebalanceAction[];
}

/**
 * Build the structured prompt for Claude.
 * The prompt forces strict JSON-only output.
 */
function buildClaudePrompt(input: ClaudeReviewInput): string {
  return `You are a crypto portfolio risk critic. You review a deterministic rebalance proposal and challenge it.

## Your Role
- Challenge the proposal for concentration risk, correlation overexposure, weak rationale
- Prefer USDT parking over weak forced rotation
- Veto low-quality plans
- Do NOT invent actions outside the allowed schema
- Do NOT suggest specific buy targets — that is Gemini's job

## Portfolio Snapshot
Market Regime: ${input.regime}
HHI: ${(input.risk.hhi * 10000).toFixed(0)}
Top Holding: ${input.risk.topHoldingSymbol} at ${(input.risk.topHoldingWeight * 100).toFixed(1)}%
Top Cluster: ${input.risk.topClusterName} at ${(input.risk.topClusterWeight * 100).toFixed(1)}%
Concentration Risk: ${input.risk.concentrationRisk}
Regime Warnings: ${input.risk.regimeWarnings.join('; ') || 'None'}
Drawdown Flags: ${input.risk.drawdownRiskFlags.join('; ') || 'None'}

## Asset Scores
${input.scores.map(s => `${s.symbol}: weight=${(s.currentWeight * 100).toFixed(1)}%, score=${s.totalScore.toFixed(3)}, liquidity=${s.liquidityScore.toFixed(2)}, pump_risk=${s.pumpRiskScore.toFixed(2)}, concentration_penalty=${s.concentrationPenalty.toFixed(2)}`).join('\n')}

## Proposed Actions
${input.proposedActions.map(a => `${a.action} ${a.symbol} ${a.fromWeight !== undefined ? `from ${(a.fromWeight * 100).toFixed(1)}%` : ''} ${a.toWeight !== undefined ? `to ${(a.toWeight * 100).toFixed(1)}%` : ''} reasons: ${a.reasonCodes.join(', ')}`).join('\n')}

## Required Output Format (JSON only, no other text)
{
  "verdict": "approve" | "approve_with_caution" | "veto",
  "confidence": 0.0 to 1.0,
  "riskFindings": [
    {
      "type": "concentration" | "correlation" | "liquidity" | "pump" | "sentiment" | "execution",
      "severity": "low" | "medium" | "high",
      "message": "description"
    }
  ],
  "criticisms": ["text"],
  "requiredChanges": ["text"]
}

Respond with ONLY the JSON object. No markdown, no explanation.`;
}

/**
 * Call Claude via Supabase edge function.
 */
export async function runClaudeReview(
  input: ClaudeReviewInput,
): Promise<ValidationResult<ClaudeReview>> {
  const prompt = buildClaudePrompt(input);

  try {
    const { data, error } = await supabase.functions.invoke('ai-rebalance-review', {
      body: {
        provider: 'claude',
        role: 'risk_critic',
        prompt,
        schema: 'claude_review',
      },
    });

    if (error) {
      console.error('[runClaudeReview] Edge function error:', error);
      return {
        valid: false,
        data: null,
        errors: [`Edge function error: ${error.message}`],
      };
    }

    // Extract and validate JSON from response
    const responseText = data?.response || data?.result || JSON.stringify(data);
    const parsed = extractJSON(typeof responseText === 'string' ? responseText : JSON.stringify(responseText));

    if (!parsed) {
      return {
        valid: false,
        data: null,
        errors: ['Failed to extract JSON from Claude response'],
      };
    }

    return validateClaudeOutput(parsed);
  } catch (err) {
    console.error('[runClaudeReview] Error:', err);
    return {
      valid: false,
      data: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Generate a deterministic fallback when Claude is unavailable.
 * This is a conservative review that approves simple trims but vetoes complex plans.
 */
export function generateClaudeFallback(input: ClaudeReviewInput): ClaudeReview {
  const riskFindings = [];

  if (input.risk.concentrationRisk === 'critical' || input.risk.concentrationRisk === 'high') {
    riskFindings.push({
      type: 'concentration' as const,
      severity: 'high' as const,
      message: `Concentration risk is ${input.risk.concentrationRisk} (HHI: ${(input.risk.hhi * 10000).toFixed(0)})`,
    });
  }

  if (input.risk.topHoldingWeight > 0.30) {
    riskFindings.push({
      type: 'concentration' as const,
      severity: 'medium' as const,
      message: `${input.risk.topHoldingSymbol} at ${(input.risk.topHoldingWeight * 100).toFixed(1)}% is overweight`,
    });
  }

  const hasReplaceActions = input.proposedActions.some(a => a.action === 'replace_candidate_review');
  const hasOnlyTrims = input.proposedActions.every(a =>
    a.action === 'trim' || a.action === 'hold' || a.action === 'park_usdt' || a.action === 'no_action'
  );

  return {
    verdict: hasOnlyTrims ? 'approve_with_caution' : (hasReplaceActions ? 'approve_with_caution' : 'approve'),
    confidence: 0.5,
    riskFindings,
    criticisms: ['Deterministic fallback — Claude unavailable for live review'],
    requiredChanges: hasReplaceActions ? ['Consider USDT parking over unreviewed replacements'] : [],
  };
}
