/**
 * Portfolio calculation helpers.
 * No external dependencies — works with plain typed data.
 */

export interface TxInput {
  id: string;
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  venue: string | null;
  note: string | null;
  assets: { symbol: string; name: string };
}

export interface AssetInput {
  id: string;
  symbol: string;
  name: string;
}

export interface PriceCacheInput {
  asset_id: string;
  price: number;
}

export interface Lot {
  id: string;
  assetId: string;
  symbol: string;
  timestamp: string;
  qty: number;
  qtyRemaining: number;
  unitCost: number;
  totalCost: number;
  venue: string | null;
  note: string | null;
}

export interface Position {
  assetId: string;
  symbol: string;
  name: string;
  qty: number;
  costBasis: number;
  avgCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPnL: number | null;
  realizedPnL: number;
  trackingMode: 'fifo' | 'dca';
  lots: Lot[];
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  positions: Position[];
}

export function calculateFIFOLots(
  transactions: TxInput[],
  assetId: string
): { lots: Lot[]; realizedPnL: number } {
  const assetTxs = transactions
    .filter(tx => tx.asset_id === assetId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const lots: Lot[] = [];
  let realizedPnL = 0;

  for (const tx of assetTxs) {
    if (tx.type === 'buy') {
      const totalCost = tx.qty * tx.unit_price + tx.fee_amount;
      const unitCost = tx.qty > 0 ? totalCost / tx.qty : 0;

      lots.push({
        id: tx.id,
        assetId: tx.asset_id,
        symbol: tx.assets.symbol,
        timestamp: tx.timestamp,
        qty: tx.qty,
        qtyRemaining: tx.qty,
        unitCost,
        totalCost,
        venue: tx.venue,
        note: tx.note,
      });
    } else if (tx.type === 'sell') {
      let qtyToConsume = tx.qty;
      let costBasisConsumed = 0;

      for (const lot of lots) {
        if (qtyToConsume <= 0) break;
        if (lot.qtyRemaining <= 0) continue;

        const consumeQty = Math.min(lot.qtyRemaining, qtyToConsume);
        const consumeCost = consumeQty * lot.unitCost;

        lot.qtyRemaining -= consumeQty;
        qtyToConsume -= consumeQty;
        costBasisConsumed += consumeCost;
      }

      const saleProceeds = tx.qty * tx.unit_price - tx.fee_amount;
      realizedPnL += saleProceeds - costBasisConsumed;
    }
  }

  return {
    lots: lots.filter(lot => lot.qtyRemaining > 0),
    realizedPnL,
  };
}

export function calculateDCAPosition(
  transactions: TxInput[],
  assetId: string
): { qty: number; costBasis: number; avgCost: number; realizedPnL: number } {
  const assetTxs = transactions
    .filter(tx => tx.asset_id === assetId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let totalQty = 0;
  let totalCostBasis = 0;
  let realizedPnL = 0;

  for (const tx of assetTxs) {
    if (tx.type === 'buy') {
      const buyCost = tx.qty * tx.unit_price + tx.fee_amount;
      totalQty += tx.qty;
      totalCostBasis += buyCost;
    } else if (tx.type === 'sell') {
      if (totalQty > 0) {
        const avgCostPerUnit = totalCostBasis / totalQty;
        const costBasisConsumed = tx.qty * avgCostPerUnit;

        totalQty -= tx.qty;
        totalCostBasis -= costBasisConsumed;

        const saleProceeds = tx.qty * tx.unit_price - tx.fee_amount;
        realizedPnL += saleProceeds - costBasisConsumed;
      }
    } else if (tx.type === 'fee') {
      totalCostBasis += tx.fee_amount;
    }
  }

  const avgCost = totalQty > 0 ? totalCostBasis / totalQty : 0;

  return { qty: totalQty, costBasis: totalCostBasis, avgCost, realizedPnL };
}

export function calculatePortfolio(
  transactions: TxInput[],
  assets: AssetInput[],
  priceCaches: PriceCacheInput[],
  trackingMode: 'fifo' | 'dca' = 'fifo'
): PortfolioSummary {
  const priceMap = new Map<string, number>();
  for (const cache of priceCaches) {
    priceMap.set(cache.asset_id, cache.price);
  }

  const assetMap = new Map<string, AssetInput>();
  for (const asset of assets) {
    assetMap.set(asset.id, asset);
  }

  const assetIds = [...new Set(transactions.map(tx => tx.asset_id))];
  const positions: Position[] = [];

  let totalValue = 0;
  let totalCost = 0;
  let totalUnrealizedPnL = 0;
  let totalRealizedPnL = 0;

  for (const assetId of assetIds) {
    const asset = assetMap.get(assetId);
    if (!asset) continue;

    const currentPrice = priceMap.get(assetId) || null;

    if (trackingMode === 'fifo') {
      const { lots, realizedPnL } = calculateFIFOLots(transactions, assetId);
      const qty = lots.reduce((sum, lot) => sum + lot.qtyRemaining, 0);
      const costBasis = lots.reduce((sum, lot) => sum + lot.qtyRemaining * lot.unitCost, 0);
      const avgCost = qty > 0 ? costBasis / qty : 0;
      const marketValue = currentPrice !== null ? qty * currentPrice : null;
      const unrealizedPnL = marketValue !== null ? marketValue - costBasis : null;

      if (qty > 0) {
        positions.push({
          assetId, symbol: asset.symbol, name: asset.name,
          qty, costBasis, avgCost, currentPrice, marketValue,
          unrealizedPnL, realizedPnL, trackingMode: 'fifo', lots,
        });
        totalCost += costBasis;
        if (marketValue !== null) totalValue += marketValue;
        if (unrealizedPnL !== null) totalUnrealizedPnL += unrealizedPnL;
        totalRealizedPnL += realizedPnL;
      }
    } else {
      const { qty, costBasis, avgCost, realizedPnL } = calculateDCAPosition(transactions, assetId);
      const marketValue = currentPrice !== null ? qty * currentPrice : null;
      const unrealizedPnL = marketValue !== null ? marketValue - costBasis : null;

      if (qty > 0) {
        positions.push({
          assetId, symbol: asset.symbol, name: asset.name,
          qty, costBasis, avgCost, currentPrice, marketValue,
          unrealizedPnL, realizedPnL, trackingMode: 'dca', lots: [],
        });
        totalCost += costBasis;
        if (marketValue !== null) totalValue += marketValue;
        if (unrealizedPnL !== null) totalUnrealizedPnL += unrealizedPnL;
        totalRealizedPnL += realizedPnL;
      }
    }
  }

  positions.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
  return { totalValue, totalCost, totalUnrealizedPnL, totalRealizedPnL, positions };
}

export function isPriceStale(timestamp: string, maxAgeMinutes: number = 5): boolean {
  const priceTime = new Date(timestamp).getTime();
  return Date.now() - priceTime > maxAgeMinutes * 60 * 1000;
}
