import type { CryptoTx } from "./cryptoState";

export type CostBasisMethod = "FIFO" | "LIFO" | "HIFO" | "AVCO";

export interface MethodResult {
  method: CostBasisMethod;
  totalMV: number;
  totalCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
}

interface Lot { qty: number; unitCost: number; ts: number; }

function runMethod(
  txs: CryptoTx[],
  method: CostBasisMethod,
  getPrice: (sym: string) => number | null,
): Omit<MethodResult, "method"> {
  const IN_TYPES = new Set(["buy", "transfer_in"]);
  const OUT_TYPES = new Set(["sell", "transfer_out"]);
  const sorted = [...txs].sort((a, b) => a.ts - b.ts);

  const lotsMap = new Map<string, Lot[]>();
  let realizedPnl = 0;

  for (const tx of sorted) {
    const sym = (tx.asset || "").toUpperCase();
    if (!sym) continue;
    if (!lotsMap.has(sym)) lotsMap.set(sym, []);
    const lots = lotsMap.get(sym)!;
    const type = (tx.type || "").toLowerCase();
    const q = Math.abs(Number(tx.qty || 0));
    if (!(q > 0)) continue;

    if (IN_TYPES.has(type)) {
      const price = Number(tx.price || 0);
      const fee = Number(tx.fee || 0);
      const cost = type === "buy" ? q * price + fee : q * Math.max(price, 0);
      lots.push({ qty: q, unitCost: q > 0 ? cost / q : 0, ts: tx.ts });
    } else if (OUT_TYPES.has(type)) {
      let rem = q;
      // Sort lots by method
      let orderedLots: Lot[];
      if (method === "FIFO") orderedLots = [...lots].sort((a, b) => a.ts - b.ts);
      else if (method === "LIFO") orderedLots = [...lots].sort((a, b) => b.ts - a.ts);
      else if (method === "HIFO") orderedLots = [...lots].sort((a, b) => b.unitCost - a.unitCost);
      else orderedLots = lots; // AVCO: consume proportionally

      if (method === "AVCO") {
        const totalQty = lots.reduce((s, l) => s + l.qty, 0);
        const totalCost = lots.reduce((s, l) => s + l.qty * l.unitCost, 0);
        const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
        if (type === "sell") {
          const proceeds = q * Number(tx.price || 0) - Number(tx.fee || 0);
          realizedPnl += proceeds - rem * avgCost;
        }
        // Reduce all lots proportionally
        const ratio = totalQty > 0 ? Math.min(rem / totalQty, 1) : 0;
        for (const lot of lots) lot.qty *= (1 - ratio);
      } else {
        for (const lot of orderedLots) {
          if (rem <= 0) break;
          const take = Math.min(lot.qty, rem);
          if (type === "sell") {
            const proceeds = take * Number(tx.price || 0) - (take / q) * Number(tx.fee || 0);
            realizedPnl += proceeds - take * lot.unitCost;
          }
          lot.qty -= take;
          rem -= take;
          // sync back to original lots array
          const orig = lots.find(l => l === lot);
          if (orig) orig.qty = lot.qty;
        }
      }
    }
  }

  // Compute open positions MV and cost
  let totalMV = 0, totalCost = 0;
  for (const [sym, lots] of lotsMap) {
    const openQty = lots.reduce((s, l) => s + l.qty, 0);
    const openCost = lots.reduce((s, l) => s + l.qty * l.unitCost, 0);
    if (openQty > 1e-10) {
      totalCost += openCost;
      const price = getPrice(sym);
      if (price !== null) totalMV += openQty * price;
      else totalMV += openCost; // fallback: use cost as proxy
    }
  }

  const unrealizedPnl = totalMV - totalCost;
  const totalPnl = unrealizedPnl + realizedPnl;
  return {
    totalMV, totalCost, unrealizedPnl, realizedPnl,
    totalPnl,
    totalPnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
  };
}

export function compareAllMethods(
  txs: CryptoTx[],
  getPrice: (sym: string) => number | null,
): MethodResult[] {
  const methods: CostBasisMethod[] = ["FIFO", "LIFO", "HIFO", "AVCO"];
  return methods.map(method => ({ method, ...runMethod(txs, method, getPrice) }));
}
