// ─── Rebalance Types ─────────────────────────────────────────────────────────
// Strict typed domain model for AI-assisted portfolio rebalancing.
// All AI layers output schema-validated JSON conforming to these types.

export type MarketRegime = 'risk_on' | 'neutral' | 'risk_off';

export type RebalanceActionType =
  | 'trim'
  | 'hold'
  | 'park_usdt'
  | 'replace_candidate_review'
  | 'no_action';

export type ClaudeVerdict =
  | 'approve'
  | 'approve_with_caution'
  | 'veto';

export type GeminiVerdict =
  | 'replace'
  | 'hold_usdt'
  | 'no_action';

export type RebalanceRunStatus =
  | 'pending'
  | 'analysis_complete'
  | 'ai_review_complete'
  | 'approved_trims_only'
  | 'approved_trims_park'
  | 'approved_full'
  | 'rejected'
  | 'expired';

export type RebalanceActionStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'executed';

export type RiskFindingSeverity = 'low' | 'medium' | 'high';

export type RiskFindingType =
  | 'concentration'
  | 'correlation'
  | 'liquidity'
  | 'pump'
  | 'sentiment'
  | 'execution';

export type SentimentLabel = 'bearish' | 'mixed' | 'bullish';
export type BreadthLabel = 'weak' | 'mixed' | 'strong';

// ─── Risk configuration ──────────────────────────────────────────────────────

export interface RiskGuardConfig {
  maxSingleAssetWeight: number;    // default 0.20
  maxClusterWeight: number;        // default 0.35
  minLiquidityScore: number;       // default 0.30
  maxPumpRiskToBuy: number;        // default 0.70
  maxCorrelationToExisting: number; // default 0.80
  minCandidateCount: number;
  relaxedMinLiquidityScore: number;
  relaxedMaxCorrelationToExisting: number;
  candidateScoreFloor: number;
}

export const DEFAULT_RISK_GUARD_CONFIG: RiskGuardConfig = {
  maxSingleAssetWeight: 0.20,
  maxClusterWeight: 0.35,
  minLiquidityScore: 0.30,
  maxPumpRiskToBuy: 0.70,
  maxCorrelationToExisting: 0.80,
  minCandidateCount: 2,
  relaxedMinLiquidityScore: 0.18,
  relaxedMaxCorrelationToExisting: 0.92,
  candidateScoreFloor: 0.45,
};

// ─── Scoring weights ─────────────────────────────────────────────────────────

export interface ScoringWeights {
  liquidity: number;
  sentiment: number;
  breadthFit: number;
  conviction: number;
  whale: number;
  pumpRisk: number;       // negative weight
  correlation: number;    // negative weight
  concentration: number;  // negative weight
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  liquidity: 0.18,
  sentiment: 0.16,
  breadthFit: 0.14,
  conviction: 0.12,
  whale: 0.10,
  pumpRisk: 0.14,
  correlation: 0.10,
  concentration: 0.06,
};

// ─── Asset scoring ───────────────────────────────────────────────────────────

export interface AssetScoreSnapshot {
  symbol: string;
  currentWeight: number;
  pnlPct: number;
  volatility7d: number;
  volatility30d: number;
  liquidityScore: number;
  sentimentScore: number;
  whaleScore: number;
  pumpRiskScore: number;
  breadthFitScore: number;
  correlationPenalty: number;
  concentrationPenalty: number;
  convictionScore: number;
  totalScore: number;
}

// ─── Portfolio risk ──────────────────────────────────────────────────────────

export interface PortfolioRiskSnapshot {
  hhi: number;
  topHoldingWeight: number;
  topHoldingSymbol: string;
  topClusterWeight: number;
  topClusterName: string;
  drawdownRiskFlags: string[];
  regimeWarnings: string[];
  concentrationRisk: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Rebalance actions ───────────────────────────────────────────────────────

export interface RebalanceAction {
  action: RebalanceActionType;
  symbol: string;
  fromWeight?: number;
  toWeight?: number;
  reasonCodes: string[];
}

// ─── Claude review ───────────────────────────────────────────────────────────

export interface RiskFinding {
  type: RiskFindingType;
  severity: RiskFindingSeverity;
  message: string;
}

export interface ClaudeReview {
  verdict: ClaudeVerdict;
  confidence: number;
  riskFindings: RiskFinding[];
  criticisms: string[];
  requiredChanges: string[];
}

// ─── Gemini review ───────────────────────────────────────────────────────────

export interface GeminiCandidate {
  symbol: string;
  role: string;
  score: number;
  why: string[];
  risks: string[];
}

export interface GeminiMarketSummary {
  regime: MarketRegime;
  sentiment: SentimentLabel;
  breadth: BreadthLabel;
}

export interface GeminiReview {
  verdict: GeminiVerdict;
  confidence: number;
  marketSummary: GeminiMarketSummary;
  candidates: GeminiCandidate[];
}

// ─── Consensus result ────────────────────────────────────────────────────────

export interface ConsensusResult {
  finalActions: RebalanceAction[];
  deterministicPlanUsed: boolean;
  claudeVerdict: ClaudeVerdict | null;
  geminiVerdict: GeminiVerdict | null;
  vetoed: boolean;
  vetoReasons: string[];
  useParkUsdt: boolean;
  candidates: GeminiCandidate[];
  timestamp: string;
}

// ─── Full rebalance run ──────────────────────────────────────────────────────

export interface RebalanceRun {
  id: string;
  userId: string;
  portfolioId?: string;
  regime: MarketRegime;
  hhi: number;
  topHoldingWeight: number;
  topClusterWeight: number;
  concentrationRisk: string;
  deterministicRecommendation: RebalanceAction[];
  status: RebalanceRunStatus;
  createdAt: string;
}

// ─── Asset signal input ──────────────────────────────────────────────────────

export interface AssetSignalInput {
  symbol: string;
  weight: number;
  pnlPct: number;
  price: number;
  marketCap: number;
  volume24h: number;
  volatility7d: number;
  volatility30d: number;
  change1h: number;
  change24h: number;
  change7d: number;
  narrativeCluster?: string;
}

// ─── Risk guard violation ────────────────────────────────────────────────────

export interface RiskGuardViolation {
  rule: string;
  asset?: string;
  current: number;
  threshold: number;
  message: string;
  blocked: boolean;
}
