import type { CryptoTx } from "./cryptoState";
import { derivePortfolio } from "./derivePortfolio";

export interface DrawdownPoint { ts: number; value: number; drawdown: number; drawdownPct: number; }

export function computeDrawdownSeries(
  txs: CryptoTx[],
  getPrice: (sym: string) => number | null,
): { points: DrawdownPoint[]; maxDrawdown: number; maxDrawdownPct: number; } {
  if (txs.length === 0) return { points: [], maxDrawdown: 0, maxDrawdownPct: 0 };

  const sorted = [...txs].sort((a, b) => a.ts - b.ts);
  const dayMap = new Map<string, CryptoTx[]>();
  for (const tx of sorted) {
    const day = new Date(tx.ts).toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, []);
    dayMap.get(day)!.push(tx);
  }

  const days = [...dayMap.keys()].sort();
  const txsUpTo: CryptoTx[] = [];
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const points: DrawdownPoint[] = [];

  for (const day of days) {
    txsUpTo.push(...dayMap.get(day)!);
    const p = derivePortfolio(txsUpTo, getPrice, 0);
    const value = p.totalMV || p.totalCost;
    if (value > peak) peak = value;
    const drawdown = peak - value;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    if (drawdown > maxDrawdown) { maxDrawdown = drawdown; maxDrawdownPct = drawdownPct; }
    points.push({ ts: new Date(day + "T00:00:00Z").getTime(), value, drawdown, drawdownPct });
  }

  return { points, maxDrawdown, maxDrawdownPct };
}
