/**
 * computePortfolioRisk — Portfolio-level risk computation.
 *
 * Computes HHI, top holding weight, cluster exposure, drawdown flags,
 * and regime warnings. All deterministic.
 */

import type {
  AssetSignalInput,
  PortfolioRiskSnapshot,
  MarketRegime,
} from '../types/rebalance';

/** Narrative cluster mapping. Assets get assigned to clusters for concentration analysis. */
const NARRATIVE_CLUSTERS: Record<string, string> = {
  BTC: 'store_of_value',
  ETH: 'smart_contract_platform',
  SOL: 'smart_contract_platform',
  AVAX: 'smart_contract_platform',
  DOT: 'smart_contract_platform',
  ADA: 'smart_contract_platform',
  MATIC: 'smart_contract_platform',
  BNB: 'exchange_token',
  FTT: 'exchange_token',
  CRO: 'exchange_token',
  LINK: 'oracle_infrastructure',
  BAND: 'oracle_infrastructure',
  UNI: 'defi',
  AAVE: 'defi',
  COMP: 'defi',
  MKR: 'defi',
  SNX: 'defi',
  DOGE: 'meme',
  SHIB: 'meme',
  PEPE: 'meme',
  FLOKI: 'meme',
  USDT: 'stablecoin',
  USDC: 'stablecoin',
  DAI: 'stablecoin',
  XRP: 'payment',
  XLM: 'payment',
  ATOM: 'interop',
  ICP: 'infrastructure',
};

/**
 * Resolve the narrative cluster for an asset.
 */
function resolveCluster(asset: AssetSignalInput): string {
  if (asset.narrativeCluster) return asset.narrativeCluster;
  return NARRATIVE_CLUSTERS[asset.symbol.toUpperCase()] || 'other';
}

/**
 * Compute HHI (Herfindahl-Hirschman Index) from weights.
 * Range: 0 (perfectly diversified) to 1 (single asset).
 * HHI > 0.25 = highly concentrated.
 */
function computeHHI(assets: AssetSignalInput[]): number {
  return assets.reduce((sum, a) => sum + a.weight * a.weight, 0);
}

/**
 * Find the top holding by weight.
 */
function findTopHolding(assets: AssetSignalInput[]): { symbol: string; weight: number } {
  if (assets.length === 0) return { symbol: '-', weight: 0 };
  const sorted = [...assets].sort((a, b) => b.weight - a.weight);
  return { symbol: sorted[0].symbol, weight: sorted[0].weight };
}

/**
 * Find the top narrative cluster by total weight.
 */
function findTopCluster(assets: AssetSignalInput[]): { name: string; weight: number } {
  const clusterWeights = new Map<string, number>();
  for (const asset of assets) {
    const cluster = resolveCluster(asset);
    clusterWeights.set(cluster, (clusterWeights.get(cluster) || 0) + asset.weight);
  }

  let topCluster = '-';
  let topWeight = 0;
  for (const [name, weight] of clusterWeights) {
    if (weight > topWeight) {
      topCluster = name;
      topWeight = weight;
    }
  }
  return { name: topCluster, weight: topWeight };
}

/**
 * Detect drawdown risk flags.
 */
function detectDrawdownFlags(assets: AssetSignalInput[], regime: MarketRegime): string[] {
  const flags: string[] = [];

  // Portfolio heavily in recent losers
  const bigLosers = assets.filter(a => a.change7d < -15 && a.weight > 0.1);
  if (bigLosers.length > 0) {
    flags.push(`${bigLosers.length} large positions down >15% in 7d`);
  }

  // High volatility in large positions
  const volHeavy = assets.filter(a => a.volatility7d > 50 && a.weight > 0.05);
  if (volHeavy.length > 0) {
    flags.push(`${volHeavy.length} positions with >50% 7d volatility`);
  }

  // All negative = potential cascade
  const allNeg = assets.every(a => a.change24h < 0);
  if (allNeg && assets.length >= 3) {
    flags.push('All positions negative in 24h — potential market cascade');
  }

  // Risk-off regime intensifier
  if (regime === 'risk_off') {
    flags.push('Market regime is risk_off — drawdown risk elevated');
  }

  return flags;
}

/**
 * Generate regime-specific warnings.
 */
function generateRegimeWarnings(
  assets: AssetSignalInput[],
  hhi: number,
  topHoldingWeight: number,
  topClusterWeight: number,
): string[] {
  const warnings: string[] = [];

  if (hhi > 0.35) {
    warnings.push(`Critical concentration: HHI ${(hhi * 10000).toFixed(0)} — heavy single-asset exposure`);
  } else if (hhi > 0.25) {
    warnings.push(`High concentration: HHI ${(hhi * 10000).toFixed(0)}`);
  }

  if (topHoldingWeight > 0.40) {
    warnings.push(`Dominant position exceeds 40% — extreme single-point-of-failure risk`);
  } else if (topHoldingWeight > 0.25) {
    warnings.push(`Largest position at ${(topHoldingWeight * 100).toFixed(1)}% — consider trimming`);
  }

  if (topClusterWeight > 0.50) {
    warnings.push(`Narrative cluster exceeds 50% — sector crash risk`);
  } else if (topClusterWeight > 0.35) {
    warnings.push(`Top narrative cluster at ${(topClusterWeight * 100).toFixed(1)}% — elevated sector exposure`);
  }

  // Stablecoin check
  const stableWeight = assets
    .filter(a => resolveCluster(a) === 'stablecoin')
    .reduce((s, a) => s + a.weight, 0);
  if (stableWeight > 0.50) {
    warnings.push(`${(stableWeight * 100).toFixed(0)}% in stablecoins — capital may be underdeployed`);
  }

  return warnings;
}

/**
 * Classify overall concentration risk.
 */
function classifyConcentrationRisk(
  hhi: number,
  topHoldingWeight: number,
  topClusterWeight: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (hhi > 0.35 || topHoldingWeight > 0.40 || topClusterWeight > 0.55) return 'critical';
  if (hhi > 0.25 || topHoldingWeight > 0.25 || topClusterWeight > 0.40) return 'high';
  if (hhi > 0.15 || topHoldingWeight > 0.15 || topClusterWeight > 0.30) return 'medium';
  return 'low';
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function computePortfolioRisk(
  assets: AssetSignalInput[],
  regime: MarketRegime,
): PortfolioRiskSnapshot {
  const hhi = computeHHI(assets);
  const topHolding = findTopHolding(assets);
  const topCluster = findTopCluster(assets);
  const drawdownRiskFlags = detectDrawdownFlags(assets, regime);
  const regimeWarnings = generateRegimeWarnings(assets, hhi, topHolding.weight, topCluster.weight);
  const concentrationRisk = classifyConcentrationRisk(hhi, topHolding.weight, topCluster.weight);

  return {
    hhi,
    topHoldingWeight: topHolding.weight,
    topHoldingSymbol: topHolding.symbol,
    topClusterWeight: topCluster.weight,
    topClusterName: topCluster.name,
    drawdownRiskFlags,
    regimeWarnings,
    concentrationRisk,
  };
}
