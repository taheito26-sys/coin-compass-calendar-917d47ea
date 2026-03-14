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

const IN_TYPES = new Set(["buy", "reward", "transfer_in", "deposit"]);
const OUT_TYPES = new Set(["sell", "transfer_out", "withdrawal", "fee"]);

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

    const isAdjustment = type === "adjustment";
    const isIn = IN_TYPES.has(type) || (isAdjustment && rawQty >= 0);
    const isOut = OUT_TYPES.has(type) || (isAdjustment && rawQty < 0);

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
): PortfolioSummary {
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const { lotsMap, realizedByAsset, txCountByAsset } = runFifo(sorted);

  const positions: DerivedPosition[] = [];

  for (const [sym, lots] of lotsMap) {
    const openLots = lots.filter((l) => l.qtyRem > 1e-10);
    const totalQty = openLots.reduce((s, l) => s + l.qtyRem, 0);
    const totalCost = openLots.reduce((s, l) => s + l.qtyRem * l.unitCost, 0);

    if (totalQty <= 1e-10) continue;

    const price = getPrice(sym);
    const mv = price !== null ? price * totalQty : null;
    const unreal = mv !== null ? mv - totalCost : null;
    const avg = totalQty > 0 ? totalCost / totalQty : 0;

    positions.push({
      sym,
      qty: totalQty,
      cost: totalCost,
      price,
      mv,
      unreal,
      avg,
      lots: openLots,
      realizedPnl: realizedByAsset.get(sym) || 0,
      txCount: txCountByAsset.get(sym) || 0,
    });
  }

  positions.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));

  const totalMV = positions.reduce((s, p) => s + (p.mv ?? 0), 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);

  return {
    positions,
    totalMV,
    totalCost,
    totalPnl,
    totalPnlPct,
    realizedPnl,
    assetCount: positions.length,
    txCount: sorted.length,
  };
}
