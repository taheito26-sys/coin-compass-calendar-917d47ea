export type MarketRegime = 'risk_on' | 'neutral' | 'risk_off';

export interface AIAnalysisResult {
  marketState: {
    regime: MarketRegime;
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
  analysis: AIAnalysisResult;
  portfolioMeta: {
    totalValue: number;
    stablecoinRatio: number;
    riskLevel: string;
  };
}

export interface AIAnalysisStatus {
  status: 'idle' | 'loading' | 'success' | 'error' | 'partial';
  error: string | null;
}
