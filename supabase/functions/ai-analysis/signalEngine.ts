import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface MarketSignals {
  sentiment: {
    score: number; // 0 to 100
    label: string;
    trend: 'improving' | 'stable' | 'deteriorating';
  };
  whaleActivity: {
    accumulation: string[]; // symbols being accumulated
    distribution: string[]; // symbols being sold by whales
    significantMoves: boolean;
  };
  marketRegime: 'risk_on' | 'neutral' | 'risk_off';
  pumpRisk: {
    highRiskAssets: string[];
    suspiciousVolatility: boolean;
  };
  liquidity: {
    depthScore: number; // 0 to 100
    slippageWarning: string[];
  };
  concentration: {
    hhi: number;
    maxAsset: string;
    maxWeight: number;
  };
  replacementOpportunities: string[];
  momentum: {
    positive: string[];
    negative: string[];
  };
}

export async function aggregateMarketSignals(
  supabase: SupabaseClient,
  holdings: any[]
): Promise<MarketSignals> {
  const symbols = holdings.map(h => h.symbol);
  
  // 1. Fetch Sentiment
  const { data: sentimentData } = await supabase
    .from("sentiment_cache")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(10);
    
  let sentimentScore = 50;
  if (sentimentData && sentimentData.length > 0) {
    const sum = sentimentData.reduce((acc, s) => acc + (s.score || 50), 0);
    sentimentScore = sum / sentimentData.length;
  }

  // 2. Fetch Whale Activity
  const { data: whaleData } = await supabase
    .from("whale_cache")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(20);
    
  const accumulation: string[] = [];
  const distribution: string[] = [];
  if (whaleData) {
    for (const w of whaleData) {
      if (w.action === "buy" || w.action === "accumulate") accumulation.push(w.symbol);
      if (w.action === "sell" || w.action === "distribute") distribution.push(w.symbol);
    }
  }

  // 3. Detect Market Regime
  let regime: 'risk_on' | 'neutral' | 'risk_off' = "neutral";
  if (sentimentScore > 75) regime = "risk_on";
  if (sentimentScore < 35) regime = "risk_off";

  // 4. Pump Risk & Token Risk Flags
  const { data: riskFlags } = await supabase
    .from("token_risk_flags")
    .select("symbol, risk_type")
    .in("symbol", symbols);
    
  const highRiskAssets = (riskFlags || [])
    .filter(f => f.risk_type === "pump" || f.risk_type === "high_volatility")
    .map(f => f.symbol);

  // 5. Momentum
  const { data: prices } = await supabase
    .from("price_cache")
    .select("symbol, price_change_24h")
    .in("symbol", symbols);
    
  const positiveMom = (prices || []).filter(p => (p.price_change_24h || 0) > 8).map(p => p.symbol);
  const negativeMom = (prices || []).filter(p => (p.price_change_24h || 0) < -8).map(p => p.symbol);

  return {
    sentiment: {
      score: Math.round(sentimentScore),
      label: sentimentScore > 65 ? "extremely positive" : sentimentScore > 45 ? "neutral" : "weak/bearish",
      trend: "stable",
    },
    whaleActivity: {
      accumulation: [...new Set(accumulation)],
      distribution: [...new Set(distribution)],
      significantMoves: (whaleData?.length || 0) > 12,
    },
    marketRegime: regime,
    pumpRisk: {
      highRiskAssets: [...new Set(highRiskAssets)],
      suspiciousVolatility: highRiskAssets.length > 0,
    },
    liquidity: {
      depthScore: 80,
      slippageWarning: [],
    },
    concentration: {
      hhi: 0,
      maxAsset: "",
      maxWeight: 0,
    },
    replacementOpportunities: ["FET", "RENDER", "SOL", "BNB"],
    momentum: {
      positive: positiveMom,
      negative: negativeMom,
    },
  };
}
