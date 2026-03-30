import type { CryptoTx } from "./cryptoState";
import { normalizeSymbol } from "./symbolAliases";

export interface DerivedLot {
  id: string;
  ts: number;
  asset: string;
  qty: number;
  qtyRem: number;
  unitCost: number;
  tag: string;
}

export interface DerivedPosition {
  sym: string;
  qty: number;
  cost: number;
  price: number | null;
  mv: number | null;
  unreal: number | null;
  avg: number;
  lots: DerivedLot[];
  realizedPnl: number;
  txCount: number;
}

export interface ClosedPosition {
  sym: string;
  totalBought: number;
  totalSold: number;
  totalCost: number;
  totalProceeds: number;
  realizedPnl: number;
  avgBuy: number;
  avgSell: number;
  txCount: number;
  firstTx: number; // timestamp
  lastTx: number;  // timestamp
}

export interface PortfolioSummary {
  positions: DerivedPosition[];
  closedPositions: ClosedPosition[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  realizedPnl: number;
  assetCount: number;
  txCount: number;
}

interface FifoState {
  lotsMap: Map<string, DerivedLot[]>;
  realizedByAsset: Map<string, number>;
  realizedByTxId: Map<string, number>;
  txCountByAsset: Map<string, number>;
}

const IN_TYPES = new Set(["buy", "transfer_in"]);
const OUT_TYPES = new Set(["sell", "transfer_out"]);

function runFifo(txs: CryptoTx[]): FifoState {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const lotsMap = new Map<string, DerivedLot[]>();
  const realizedByAsset = new Map<string, number>();
  const realizedByTxId = new Map<string, number>();
  const txCountByAsset = new Map<string, number>();

  let lotCounter = 0;

  for (const tx of sorted) {
    const sym = normalizeSymbol(tx.asset || "");
    if (!sym) continue;

    txCountByAsset.set(sym, (txCountByAsset.get(sym) || 0) + 1);

    if (!lotsMap.has(sym)) lotsMap.set(sym, []);
    const lots = lotsMap.get(sym)!;

    const type = String(tx.type || "").toLowerCase();
    const rawQty = Number(tx.qty || 0);
    const q = Math.abs(rawQty);

    if (!(q > 0)) continue;

    const isIn = IN_TYPES.has(type);
    const isOut = OUT_TYPES.has(type);

    if (isIn) {
      const buyLike = type === "buy";
      const price = Number(tx.price || 0);
      const fee = Number(tx.fee || 0);
      const totalCost = buyLike ? (q * price) + fee : q * Math.max(price, 0);
      const unitCost = q > 0 ? totalCost / q : 0;

      lots.push({
        id: `lot_${++lotCounter}`,
        ts: tx.ts,
        asset: sym,
        qty: q,
        qtyRem: q,
        unitCost,
        tag: type,
      });

      continue;
    }

    if (isOut) {
      let rem = q;
      let costConsumed = 0;

      for (const lot of lots) {
        if (rem <= 0) break;
        if (lot.qtyRem <= 0) continue;

        const take = Math.min(lot.qtyRem, rem);
        costConsumed += take * lot.unitCost;
        lot.qtyRem -= take;
        rem -= take;
      }

      if (type === "sell") {
        const proceeds = (q * Number(tx.price || 0)) - Number(tx.fee || 0);
        const realized = proceeds - costConsumed;
        realizedByTxId.set(tx.id, realized);
        realizedByAsset.set(sym, (realizedByAsset.get(sym) || 0) + realized);
      }
    }
  }

  return { lotsMap, realizedByAsset, realizedByTxId, txCountByAsset };
}

export function deriveRealizedByTx(txs: CryptoTx[]): Map<string, number> {
  return runFifo(txs).realizedByTxId;
}

export function derivePortfolio(
  txs: CryptoTx[],
  getPrice: (sym: string) => number | null,
  minValThreshold: number = 0
): PortfolioSummary {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const { lotsMap, realizedByAsset, txCountByAsset } = runFifo(sorted);

  const positions: DerivedPosition[] = [];
  const closedPositions: ClosedPosition[] = [];

  // Pre-compute per-asset buy/sell stats
  const assetBuyStats = new Map<string, { totalBought: number; totalCost: number; firstTs: number; lastTs: number }>();
  const assetSellStats = new Map<string, { totalSold: number; totalProceeds: number }>();

  for (const tx of sorted) {
    const sym = normalizeSymbol(tx.asset || "");
    if (!sym) continue;
    const type = String(tx.type || "").toLowerCase();
    const q = Math.abs(Number(tx.qty || 0));
    if (!(q > 0)) continue;

    if (IN_TYPES.has(type)) {
      const prev = assetBuyStats.get(sym) || { totalBought: 0, totalCost: 0, firstTs: tx.ts, lastTs: tx.ts };
      const price = Number(tx.price || 0);
      const fee = Number(tx.fee || 0);
      const cost = type === "buy" ? (q * price) + fee : q * Math.max(price, 0);
      prev.totalBought += q;
      prev.totalCost += cost;
      prev.firstTs = Math.min(prev.firstTs, tx.ts);
      prev.lastTs = Math.max(prev.lastTs, tx.ts);
      assetBuyStats.set(sym, prev);
    } else if (type === "sell") {
      const prev = assetSellStats.get(sym) || { totalSold: 0, totalProceeds: 0 };
      prev.totalSold += q;
      prev.totalProceeds += (q * Number(tx.price || 0)) - Number(tx.fee || 0);
      assetSellStats.set(sym, prev);
      const buyStats = assetBuyStats.get(sym);
      if (buyStats) buyStats.lastTs = Math.max(buyStats.lastTs, tx.ts);
    }
  }

  for (const [sym, lots] of lotsMap) {
    const openLots = lots.filter((l) => l.qtyRem > 1e-10);
    const totalQty = openLots.reduce((s, l) => s + l.qtyRem, 0);
    const totalCost = openLots.reduce((s, l) => s + l.qtyRem * l.unitCost, 0);

    if (totalQty > 1e-10) {
      const price = getPrice(sym);
      const mv = price !== null ? price * totalQty : null;
      
      // Filter threshold
      const compareVal = mv !== null ? mv : totalCost;
      if (compareVal < minValThreshold) continue;

      positions.push({
        sym,
        qty: totalQty,
        cost: totalCost,
        price,
        mv,
        unreal: mv !== null ? mv - totalCost : null,
        avg: totalQty > 0 ? totalCost / totalQty : 0,
        lots: openLots,
        realizedPnl: realizedByAsset.get(sym) || 0,
        txCount: txCountByAsset.get(sym) || 0,
      });
    } else {
      // Closed position
      const buyStats = assetBuyStats.get(sym) || { totalBought: 0, totalCost: 0, firstTs: 0, lastTs: 0 };
      const sellStats = assetSellStats.get(sym) || { totalSold: 0, totalProceeds: 0 };
      const proceeds = sellStats.totalProceeds;
      const realized = realizedByAsset.get(sym) || 0;
      
      // Filter threshold for closed pos
      if (Math.abs(proceeds) < minValThreshold && Math.abs(realized) < minValThreshold) continue;

      closedPositions.push({
        sym,
        totalBought: buyStats.totalBought,
        totalSold: sellStats.totalSold,
        totalCost: buyStats.totalCost,
        totalProceeds: sellStats.totalProceeds,
        realizedPnl: realized,
        avgBuy: buyStats.totalBought > 0 ? buyStats.totalCost / buyStats.totalBought : 0,
        avgSell: sellStats.totalSold > 0 ? sellStats.totalProceeds / sellStats.totalSold : 0,
        txCount: txCountByAsset.get(sym) || 0,
        firstTx: buyStats.firstTs,
        lastTx: buyStats.lastTs,
      });
    }
  }

  let totalMV = 0, totalCost = 0, realizedPnl = 0;
  for (const p of positions) {
    if (p.mv !== null) totalMV += p.mv;
    totalCost += p.cost;
    realizedPnl += p.realizedPnl;
  }
  for (const c of closedPositions) {
    realizedPnl += c.realizedPnl;
  }

  return {
    positions: positions.sort((a, b) => (b.mv || 0) - (a.mv || 0)),
    closedPositions: closedPositions.sort((a, b) => b.lastTx - a.lastTx),
    totalMV,
    totalCost,
    totalPnl: totalMV - totalCost,
    totalPnlPct: totalCost > 0 ? ((totalMV - totalCost) / totalCost) * 100 : 0,
    realizedPnl,
    assetCount: positions.length,
    txCount: txs.length,
  };
}
