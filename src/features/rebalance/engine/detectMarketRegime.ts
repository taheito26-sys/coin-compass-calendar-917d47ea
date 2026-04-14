/**
 * detectMarketRegime — Deterministic market regime classifier
 *
 * Determines risk_on / neutral / risk_off from portfolio signals.
 * No AI involvement. Pure computation on signal inputs.
 */

import type { MarketRegime, AssetSignalInput } from '../types/rebalance';

export interface RegimeSignals {
  breadthProxy: number;       // 0-1: fraction of assets above their 7d avg
  volatilityRegime: number;   // 0-1: normalized avg vol across portfolio
  concentrationExposure: number; // HHI-like measure
  liquidityWeakness: number;  // 0-1: fraction of assets with weak liquidity
  pumpRiskDistribution: number; // 0-1: fraction of assets showing pump signals
  sentimentRegime: number;    // -1 to 1: aggregated sentiment
  whaleDistributionPressure: number; // 0-1: whale sell pressure
}

export interface RegimeResult {
  regime: MarketRegime;
  signals: RegimeSignals;
  confidence: number;
  reasoning: string[];
}

/**
 * Compute breadth proxy: fraction of assets with positive recent performance.
 */
function computeBreadthProxy(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0.5;
  const positive = assets.filter(a => a.change7d > 0).length;
  return positive / assets.length;
}

/**
 * Compute average normalized volatility.
 * Normalize 7d vol against typical crypto ranges.
 */
function computeVolatilityRegime(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0.5;
  const vols = assets.map(a => Math.min(a.volatility7d / 100, 1));
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

/**
 * Compute HHI-like concentration from weights.
 */
function computeConcentration(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0;
  return assets.reduce((s, a) => s + a.weight * a.weight, 0);
}

/**
 * Compute liquidity weakness: fraction of assets with very low volume
 * relative to market cap.
 */
function computeLiquidityWeakness(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0;
  const weak = assets.filter(a => {
    if (a.marketCap <= 0) return true;
    const volToMcap = a.volume24h / a.marketCap;
    return volToMcap < 0.02; // less than 2% daily turnover
  }).length;
  return weak / assets.length;
}

/**
 * Detect pump risk: fraction of assets with suspicious rapid gains
 * and high volume relative to normal activity.
 */
function computePumpRiskDistribution(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0;
  const pumpy = assets.filter(a => {
    // >15% in 1h or >30% in 24h with high vol = pump signal
    return a.change1h > 15 || (a.change24h > 30 && a.volume24h > a.marketCap * 0.1);
  }).length;
  return pumpy / assets.length;
}

/**
 * Compute sentiment regime from price trends.
 * Uses a blend of 1h, 24h, and 7d changes.
 */
function computeSentimentRegime(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0;
  const scores = assets.map(a => {
    const s1h = Math.max(-1, Math.min(1, a.change1h / 10));
    const s24h = Math.max(-1, Math.min(1, a.change24h / 20));
    const s7d = Math.max(-1, Math.min(1, a.change7d / 30));
    return s1h * 0.2 + s24h * 0.3 + s7d * 0.5;
  });
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

/**
 * Compute whale distribution pressure.
 * Higher values = more selling pressure from large holders.
 * In absence of on-chain data, proxy from large price drops on high volume.
 */
function computeWhaleDistributionPressure(assets: AssetSignalInput[]): number {
  if (assets.length === 0) return 0;
  const pressured = assets.filter(a => {
    return a.change24h < -5 && a.volume24h > a.marketCap * 0.05;
  }).length;
  return pressured / assets.length;
}

/**
 * Classify regime from computed signals.
 */
function classifyRegime(signals: RegimeSignals): { regime: MarketRegime; confidence: number; reasoning: string[] } {
  let riskOffSignals = 0;
  let riskOnSignals = 0;
  const reasoning: string[] = [];

  // Breadth: > 0.6 = risk on, < 0.3 = risk off
  if (signals.breadthProxy > 0.6) {
    riskOnSignals += 2;
    reasoning.push(`Breadth strong (${(signals.breadthProxy * 100).toFixed(0)}% assets positive)`);
  } else if (signals.breadthProxy < 0.3) {
    riskOffSignals += 2;
    reasoning.push(`Breadth weak (${(signals.breadthProxy * 100).toFixed(0)}% assets positive)`);
  }

  // Volatility: > 0.6 = risk off
  if (signals.volatilityRegime > 0.6) {
    riskOffSignals += 2;
    reasoning.push(`High volatility regime (${(signals.volatilityRegime * 100).toFixed(0)}%)`);
  } else if (signals.volatilityRegime < 0.25) {
    riskOnSignals += 1;
    reasoning.push(`Low volatility (${(signals.volatilityRegime * 100).toFixed(0)}%)`);
  }

  // Concentration: > 0.25 HHI = elevated
  if (signals.concentrationExposure > 0.25) {
    riskOffSignals += 1;
    reasoning.push(`High concentration (HHI ${(signals.concentrationExposure * 10000).toFixed(0)})`);
  }

  // Liquidity weakness: > 0.4 = significant
  if (signals.liquidityWeakness > 0.4) {
    riskOffSignals += 2;
    reasoning.push(`Liquidity weakness (${(signals.liquidityWeakness * 100).toFixed(0)}% assets)`);
  }

  // Pump risk: > 0.2 = warning
  if (signals.pumpRiskDistribution > 0.2) {
    riskOffSignals += 1;
    reasoning.push(`Pump risk detected (${(signals.pumpRiskDistribution * 100).toFixed(0)}% assets)`);
  }

  // Sentiment: strong positive or negative
  if (signals.sentimentRegime > 0.3) {
    riskOnSignals += 2;
    reasoning.push(`Bullish sentiment (${(signals.sentimentRegime * 100).toFixed(0)}%)`);
  } else if (signals.sentimentRegime < -0.3) {
    riskOffSignals += 2;
    reasoning.push(`Bearish sentiment (${(signals.sentimentRegime * 100).toFixed(0)}%)`);
  }

  // Whale pressure
  if (signals.whaleDistributionPressure > 0.3) {
    riskOffSignals += 2;
    reasoning.push(`Whale distribution pressure (${(signals.whaleDistributionPressure * 100).toFixed(0)}%)`);
  }

  const total = riskOnSignals + riskOffSignals;
  const confidence = total > 0 ? Math.max(riskOnSignals, riskOffSignals) / (total + 2) : 0.5;

  if (riskOffSignals > riskOnSignals + 2) {
    return { regime: 'risk_off', confidence, reasoning };
  } else if (riskOnSignals > riskOffSignals + 2) {
    return { regime: 'risk_on', confidence, reasoning };
  }
  return { regime: 'neutral', confidence, reasoning };
}

/**
 * Main entry: detect current market regime from portfolio signals.
 */
export function detectMarketRegime(assets: AssetSignalInput[]): RegimeResult {
  const signals: RegimeSignals = {
    breadthProxy: computeBreadthProxy(assets),
    volatilityRegime: computeVolatilityRegime(assets),
    concentrationExposure: computeConcentration(assets),
    liquidityWeakness: computeLiquidityWeakness(assets),
    pumpRiskDistribution: computePumpRiskDistribution(assets),
    sentimentRegime: computeSentimentRegime(assets),
    whaleDistributionPressure: computeWhaleDistributionPressure(assets),
  };

  const { regime, confidence, reasoning } = classifyRegime(signals);

  return { regime, signals, confidence, reasoning };
}
