// AI Analysis Types — strict contract between edge function and frontend

export interface AIRecommendation {
  action: "buy" | "sell" | "hold";
  asset: string;
  confidence: number;
  priority: "low" | "medium" | "high";
  reason: {
    market: string;
    portfolio: string;
    risk: string;
  };
  alternatives?: {
    asset: string;
    weightPct: number;
    riskWeight: "low" | "medium" | "high";
    reason_ar: string;
  }[];
}

export interface AIRebalanceItem {
  asset: string;
  currentAllocation: number;
  targetAllocation: number;
  delta: number;
}

export interface AIWarning {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface AIPortfolioSummary {
  value: number;
  cash: number;
  riskLevel: string;
  diversificationScore: number;
}

export interface AIAnalysisResponse {
  model: string;
  timestamp: string;
  portfolioSummary: AIPortfolioSummary;
  recommendations: AIRecommendation[];
  rebalancePlan: AIRebalanceItem[];
  warnings: AIWarning[];
}

export interface AIAnalysisRequest {
  analysisType: "portfolio" | "asset" | "rebalance";
  model: "claude" | "gemini";
  riskProfile: "conservative" | "moderate" | "aggressive";
}

export type AIAnalysisStatus = "idle" | "loading" | "success" | "error" | "partial";
