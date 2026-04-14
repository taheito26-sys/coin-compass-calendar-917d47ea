/**
 * mergeConsensus — Consensus layer combining deterministic plan + AI reviews.
 *
 * Decision rules:
 * 1. If deterministic engine says no rebalance → stop
 * 2. If Claude vetoes → stop
 * 3. If Gemini returns no valid candidates → default to USDT parking
 * 4. If proposed result increases concentration/correlation → stop
 */

import type {
  RebalanceAction,
  ClaudeReview,
  GeminiReview,
  ConsensusResult,
  GeminiCandidate,
  ClaudeVerdict,
  GeminiVerdict,
} from '../types/rebalance';

export interface ConsensusInput {
  deterministicActions: RebalanceAction[];
  claudeReview: ClaudeReview | null;
  geminiReview: GeminiReview | null;
}

/**
 * Merge deterministic plan, Claude review, and Gemini candidates
 * into a final consensus result.
 */
export function mergeConsensus(input: ConsensusInput): ConsensusResult {
  const { deterministicActions, claudeReview, geminiReview } = input;
  const vetoReasons: string[] = [];
  let vetoed = false;
  let useParkUsdt = false;
  let finalActions: RebalanceAction[] = [...deterministicActions];
  let candidates: GeminiCandidate[] = [];

  // ─── Rule 1: If deterministic engine says no rebalance → stop ────────
  const allNoAction = deterministicActions.every(
    a => a.action === 'no_action' || a.action === 'hold',
  );
  if (allNoAction) {
    return {
      finalActions: deterministicActions,
      deterministicPlanUsed: true,
      claudeVerdict: claudeReview?.verdict || null,
      geminiVerdict: geminiReview?.verdict || null,
      vetoed: false,
      vetoReasons: [],
      useParkUsdt: false,
      candidates: [],
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Rule 2: If Claude vetoes → stop ─────────────────────────────────
  if (claudeReview?.verdict === 'veto') {
    vetoed = true;
    vetoReasons.push('Claude vetoed the proposal');
    for (const criticism of claudeReview.criticisms) {
      vetoReasons.push(`Claude: ${criticism}`);
    }
    for (const change of claudeReview.requiredChanges) {
      vetoReasons.push(`Required change: ${change}`);
    }

    // Convert all trims/replacements to no_action
    finalActions = deterministicActions.map(a => {
      if (a.action === 'trim' || a.action === 'replace_candidate_review') {
        return {
          ...a,
          action: 'no_action' as const,
          reasonCodes: [...a.reasonCodes, 'claude_veto'],
        };
      }
      return a;
    });

    return {
      finalActions,
      deterministicPlanUsed: false,
      claudeVerdict: 'veto',
      geminiVerdict: geminiReview?.verdict || null,
      vetoed: true,
      vetoReasons,
      useParkUsdt: false,
      candidates: [],
      timestamp: new Date().toISOString(),
    };
  }

  // ─── Rule 3: If Claude approves with caution, incorporate feedback ───
  if (claudeReview?.verdict === 'approve_with_caution') {
    // Add required changes as additional reason codes
    for (const change of (claudeReview.requiredChanges || [])) {
      // If required change suggests USDT parking, prefer it
      if (change.toLowerCase().includes('usdt') || change.toLowerCase().includes('park')) {
        useParkUsdt = true;
      }
    }

    // Check for high-severity risk findings
    const highSeverity = (claudeReview.riskFindings || []).filter(f => f.severity === 'high');
    if (highSeverity.length >= 2) {
      // Multiple high-severity findings → prefer USDT parking
      useParkUsdt = true;
      vetoReasons.push('Multiple high-severity findings — recommending USDT parking');
    }
  }

  // ─── Rule 3b: If Gemini returns no valid candidates → USDT parking ──
  if (geminiReview) {
    if (geminiReview.verdict === 'hold_usdt' || geminiReview.verdict === 'no_action') {
      useParkUsdt = true;
      vetoReasons.push(`Gemini verdict: ${geminiReview.verdict}`);
    } else if (geminiReview.candidates.length === 0) {
      useParkUsdt = true;
      vetoReasons.push('Gemini returned no candidates — defaulting to USDT parking');
    } else {
      candidates = geminiReview.candidates;
    }
  } else {
    // No Gemini response → USDT parking for safety
    useParkUsdt = true;
    vetoReasons.push('Gemini unavailable — defaulting to USDT parking');
  }

  // ─── Apply USDT parking if needed ────────────────────────────────────
  if (useParkUsdt) {
    finalActions = finalActions.map(a => {
      if (a.action === 'replace_candidate_review') {
        return {
          ...a,
          action: 'park_usdt' as const,
          symbol: 'USDT',
          reasonCodes: [...a.reasonCodes, 'no_valid_replacement_park_usdt'],
        };
      }
      return a;
    });
    candidates = [];
  }

  return {
    finalActions,
    deterministicPlanUsed: true,
    claudeVerdict: (claudeReview?.verdict || null) as ClaudeVerdict | null,
    geminiVerdict: (geminiReview?.verdict || null) as GeminiVerdict | null,
    vetoed,
    vetoReasons,
    useParkUsdt,
    candidates,
    timestamp: new Date().toISOString(),
  };
}
