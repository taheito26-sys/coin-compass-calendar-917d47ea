/**
 * schemas — Strict JSON schema validation for AI outputs.
 *
 * All AI output MUST pass schema validation before being used.
 * Invalid output is rejected entirely — no partial extraction.
 */

import { z } from 'zod';
import type { ClaudeReview, GeminiReview } from '../types/rebalance';

// ─── Claude output schema ────────────────────────────────────────────────────

export const claudeOutputSchema = z.object({
  verdict: z.enum(['approve', 'approve_with_caution', 'veto']),
  confidence: z.number().min(0).max(1),
  riskFindings: z.array(z.object({
    type: z.enum(['concentration', 'correlation', 'liquidity', 'pump', 'sentiment', 'execution']),
    severity: z.enum(['low', 'medium', 'high']),
    message: z.string().min(1).max(500),
  })),
  criticisms: z.array(z.string().min(1).max(500)),
  requiredChanges: z.array(z.string().min(1).max(500)),
});

// ─── Gemini output schema ────────────────────────────────────────────────────

export const geminiOutputSchema = z.object({
  verdict: z.enum(['replace', 'hold_usdt', 'no_action']),
  confidence: z.number().min(0).max(1),
  marketSummary: z.object({
    regime: z.enum(['risk_on', 'neutral', 'risk_off']),
    sentiment: z.enum(['bearish', 'mixed', 'bullish']),
    breadth: z.enum(['weak', 'mixed', 'strong']),
  }),
  candidates: z.array(z.object({
    symbol: z.string().min(1).max(20),
    role: z.string().min(1).max(200),
    score: z.number().min(0).max(1),
    why: z.array(z.string().min(1).max(500)),
    risks: z.array(z.string().min(1).max(500)),
  })),
});

// ─── Validation functions ────────────────────────────────────────────────────

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  errors: string[];
}

/**
 * Validate Claude output against schema.
 * Returns null data if validation fails — no partial extraction.
 */
export function validateClaudeOutput(raw: unknown): ValidationResult<ClaudeReview> {
  try {
    const parsed = claudeOutputSchema.parse(raw);
    return {
      valid: true,
      data: parsed as ClaudeReview,
      errors: [],
    };
  } catch (err) {
    const errors: string[] = [];
    if (err instanceof z.ZodError) {
      for (const issue of err.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      errors.push(String(err));
    }
    return { valid: false, data: null, errors };
  }
}

/**
 * Validate Gemini output against schema.
 * Returns null data if validation fails — no partial extraction.
 */
export function validateGeminiOutput(raw: unknown): ValidationResult<GeminiReview> {
  try {
    const parsed = geminiOutputSchema.parse(raw);
    return {
      valid: true,
      data: parsed as GeminiReview,
      errors: [],
    };
  } catch (err) {
    const errors: string[] = [];
    if (err instanceof z.ZodError) {
      for (const issue of err.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
    } else {
      errors.push(String(err));
    }
    return { valid: false, data: null, errors };
  }
}

/**
 * Try to parse JSON from a potentially dirty AI response.
 * Handles markdown code fences and trailing text.
 */
export function extractJSON(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch { /* fall through */ }
    }

    // Try finding first { to last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch { /* fall through */ }
    }

    return null;
  }
}
