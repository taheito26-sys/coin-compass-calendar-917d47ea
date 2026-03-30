import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { derivePortfolio } from "@/lib/derivePortfolio";
import type { CryptoTx } from "@/lib/cryptoState";

export interface NetWorthPoint { ts: number; value: number; cost: number; }

export function useNetWorthHistory(): NetWorthPoint[] {
  const { state } = useCrypto();
  const getPrice = usePortfolioPriceGetter();

  return useMemo(() => {
    if (state.txs.length === 0) return [];

    // Group transactions by day and compute running portfolio at end of each day
    const sorted = [...state.txs].sort((a, b) => a.ts - b.ts);
    const dayMap = new Map<string, CryptoTx[]>();

    for (const tx of sorted) {
      const day = new Date(tx.ts).toISOString().slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(tx);
    }

    const days = [...dayMap.keys()].sort();
    const points: NetWorthPoint[] = [];
    const txsUpTo: CryptoTx[] = [];

    for (const day of days) {
      const dayTxs = dayMap.get(day)!;
      txsUpTo.push(...dayTxs);
      const portfolio = derivePortfolio(txsUpTo, getPrice, 0);
      points.push({
        ts: new Date(day + "T00:00:00Z").getTime(),
        value: portfolio.totalMV || portfolio.totalCost,
        cost: portfolio.totalCost,
      });
    }

    // Add today's point if last point is not today
    const today = new Date().toISOString().slice(0, 10);
    if (days[days.length - 1] !== today) {
      const portfolio = derivePortfolio(sorted, getPrice, 0);
      points.push({ ts: Date.now(), value: portfolio.totalMV || portfolio.totalCost, cost: portfolio.totalCost });
    }

    return points;
  }, [state.txs, getPrice]);
}
