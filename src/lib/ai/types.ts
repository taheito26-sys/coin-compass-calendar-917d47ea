// AI Analysis Types — strict contract between edge function and frontend

export interface AIAnalysisResult {
  marketState: {
    regime: 'risk_on' | 'neutral' | 'risk_off';
    summary_ar: string;
  };
  risk: {
    primary_ar: string;
  };
  decision: {
    action_ar: string;
  };
  opportunity: {
    replacement_ar: string;
  };
  compactSummary: {
    text_ar: string;
  };
}

export interface AIAnalysisResponse {
  model: string;
  timestamp: string;
  analysis?: AIAnalysisResult; // New 360 structure
  portfolioMeta?: {
    totalValue: number;
    stablecoinRatio: number;
    riskLevel: string;
  };
  // Legacy fields (optional for compatibility)
  portfolioSummary?: {
    value: number;
    cash: number;
    riskLevel: string;
    diversificationScore: number;
  };
  recommendations?: any[];
  rebalancePlan?: any[];
  warnings?: any[];
}

export interface AIAnalysisRequest {
  analysisType: "portfolio" | "asset" | "rebalance";
  model: "claude" | "gemini";
  riskProfile: "conservative" | "moderate" | "aggressive";
}

export type AIAnalysisStatus = "idle" | "loading" | "success" | "error" | "partial";
