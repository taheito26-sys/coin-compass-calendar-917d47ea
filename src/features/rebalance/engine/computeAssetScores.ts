/**
 * computeAssetScores — Deterministic asset scoring engine.
 *
 * For each asset, produces normalized 0-1 scores across multiple dimensions.
 * Final totalScore uses configurable deterministic weighting.
 * No AI involvement.
 */

import type {
  AssetScoreSnapshot,
  AssetSignalInput,
  ScoringWeights,
} from '../types/rebalance';
import { DEFAULT_SCORING_WEIGHTS } from '../types/rebalance';

// ─── Individual score computations ───────────────────────────────────────────

/**
 * Liquidity score: volume/mcap ratio, higher = more liquid.
 */
function scoreLiquidity(asset: AssetSignalInput): number {
  if (asset.marketCap <= 0) return 0;
  const ratio = asset.volume24h / asset.marketCap;
  // Normalize: 10%+ turnover = 1.0, 0% = 0
  return Math.min(1, ratio / 0.10);
}

/**
 * Sentiment score: blend of recent price movements.
 */
function scoreSentiment(asset: AssetSignalInput): number {
  const s1h  = Math.max(-1, Math.min(1, asset.change1h / 10));
  const s24h = Math.max(-1, Math.min(1, asset.change24h / 15));
  const s7d  = Math.max(-1, Math.min(1, asset.change7d / 25));
  const raw = s1h * 0.15 + s24h * 0.35 + s7d * 0.50;
  // Map from [-1, 1] to [0, 1]
  return (raw + 1) / 2;
}

/**
 * Whale score: large-cap + high volume = favorable, sharp drops on high vol = negative.
 */
function scoreWhale(asset: AssetSignalInput): number {
  // Proxy: large cap and stable performance = whale accumulation likely
  const capScore = asset.marketCap > 10e9 ? 0.8 : asset.marketCap > 1e9 ? 0.6 : asset.marketCap > 100e6 ? 0.4 : 0.2;
  const volumeHealth = asset.volume24h > 0 && asset.marketCap > 0
    ? Math.min(1, asset.volume24h / (asset.marketCap * 0.03))
    : 0.3;
  // Negative momentum with high volume = distribution
  const distributionPenalty = (asset.change24h < -5 && volumeHealth > 0.5) ? 0.3 : 0;
  return Math.max(0, Math.min(1, capScore * 0.5 + volumeHealth * 0.5 - distributionPenalty));
}

/**
 * Pump risk: detect abnormally rapid price appreciation.
 * Higher = more risky.
 */
function scorePumpRisk(asset: AssetSignalInput): number {
  let risk = 0;
  // Extreme 1h move
  if (Math.abs(asset.change1h) > 15) risk += 0.4;
  else if (Math.abs(asset.change1h) > 8) risk += 0.2;
  // Extreme 24h move
  if (asset.change24h > 40) risk += 0.4;
  else if (asset.change24h > 20) risk += 0.2;
  // High vol spike relative to mcap
  if (asset.marketCap > 0 && asset.volume24h > asset.marketCap * 0.15) risk += 0.2;
  // Volatility spike
  if (asset.volatility7d > 60) risk += 0.2;
  return Math.min(1, risk);
}

/**
 * Breadth fit score: does this asset contribute to portfolio diversity?
 * Proxied by narrative cluster differentiation.
 */
function scoreBreadthFit(
  asset: AssetSignalInput,
  allAssets: AssetSignalInput[],
): number {
  const cluster = asset.narrativeCluster || 'unknown';
  // Count how many assets share this cluster
  const sameCluster = allAssets.filter(a => (a.narrativeCluster || 'unknown') === cluster).length;
  // Unique cluster = high breadth fit
  if (sameCluster <= 1) return 0.9;
  if (sameCluster <= 2) return 0.7;
  if (sameCluster <= 3) return 0.5;
  return Math.max(0.1, 1 - sameCluster * 0.15);
}

/**
 * Correlation penalty: how correlated is this asset to others in portfolio?
 * Simple proxy using co-movement of 7d returns.
 */
function computeCorrelationPenalty(
  asset: AssetSignalInput,
  allAssets: AssetSignalInput[],
): number {
  if (allAssets.length <= 1) return 0;
  // Simple co-movement proxy: assets that moved in same direction by similar magnitude
  const others = allAssets.filter(a => a.symbol !== asset.symbol);
  const comovers = others.filter(a => {
    const sameDir = Math.sign(a.change7d) === Math.sign(asset.change7d);
    const similarMag = Math.abs(Math.abs(a.change7d) - Math.abs(asset.change7d)) < 10;
    return sameDir && similarMag;
  });
  return Math.min(1, comovers.length / Math.max(1, others.length));
}

/**
 * Concentration penalty: how overweight is this asset?
 */
function computeConcentrationPenalty(
  asset: AssetSignalInput,
  assetCount: number,
): number {
  if (assetCount <= 0) return 0;
  const equalWeight = 1 / assetCount;
  const overweight = Math.max(0, asset.weight - equalWeight);
  // Normalize: 3x overweight = 1.0 penalty
  return Math.min(1, overweight / (equalWeight * 3));
}

/**
 * Conviction score: blend of fundamentals indicating long-term conviction.
 * Higher market cap, moderate vol, positive sentiment = high conviction.
 */
function scoreConviction(asset: AssetSignalInput): number {
  // Market cap tier
  const capScore = asset.marketCap > 50e9 ? 0.9 : asset.marketCap > 10e9 ? 0.7 : asset.marketCap > 1e9 ? 0.5 : asset.marketCap > 100e6 ? 0.3 : 0.15;
  // Moderate volatility is better than extreme
  const volScore = asset.volatility7d < 20 ? 0.8 : asset.volatility7d < 40 ? 0.6 : asset.volatility7d < 60 ? 0.4 : 0.2;
  // Positive trend
  const trendScore = asset.change7d > 5 ? 0.8 : asset.change7d > 0 ? 0.6 : asset.change7d > -10 ? 0.4 : 0.2;
  return capScore * 0.4 + volScore * 0.3 + trendScore * 0.3;
}

/**
 * Compute final total score with deterministic weights.
 */
function computeTotalScore(
  scores: Omit<AssetScoreSnapshot, 'totalScore' | 'symbol' | 'currentWeight' | 'pnlPct' | 'volatility7d' | 'volatility30d'>,
  weights: ScoringWeights,
): number {
  return (
    weights.liquidity * scores.liquidityScore +
    weights.sentiment * scores.sentimentScore +
    weights.breadthFit * scores.breadthFitScore +
    weights.conviction * scores.convictionScore +
    weights.whale * scores.whaleScore -
    weights.pumpRisk * scores.pumpRiskScore -
    weights.correlation * scores.correlationPenalty -
    weights.concentration * scores.concentrationPenalty
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Compute normalized scores for every asset in the portfolio.
 */
export function computeAssetScores(
  assets: AssetSignalInput[],
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): AssetScoreSnapshot[] {
  return assets.map(asset => {
    const liquidityScore = scoreLiquidity(asset);
    const sentimentScore = scoreSentiment(asset);
    const whaleScore = scoreWhale(asset);
    const pumpRiskScore = scorePumpRisk(asset);
    const breadthFitScore = scoreBreadthFit(asset, assets);
    const correlationPenalty = computeCorrelationPenalty(asset, assets);
    const concentrationPenalty = computeConcentrationPenalty(asset, assets.length);
    const convictionScore = scoreConviction(asset);

    const partialScores = {
      liquidityScore,
      sentimentScore,
      whaleScore,
      pumpRiskScore,
      breadthFitScore,
      correlationPenalty,
      concentrationPenalty,
      convictionScore,
    };

    const totalScore = computeTotalScore(partialScores, weights);

    return {
      symbol: asset.symbol,
      currentWeight: asset.weight,
      pnlPct: asset.pnlPct,
      volatility7d: asset.volatility7d,
      volatility30d: asset.volatility30d,
      ...partialScores,
      totalScore,
    };
  });
}
