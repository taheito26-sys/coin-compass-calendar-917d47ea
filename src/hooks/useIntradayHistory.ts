import { useState, useEffect, useRef } from "react";
import { getDailyHistory } from "@/lib/priceProvider";

const REFRESH_MS = 5 * 60 * 1000; // 5 min — intraday shape doesn't need to be second-fresh

/**
 * Fetches today's intraday price path (15m candles, last 24h) for a batch of
 * symbols, TradingView-mini-chart style. Refetches periodically so the shape
 * keeps up with the day as it unfolds.
 */
export function useIntradayHistory(syms: string[]) {
  const [data, setData] = useState<Map<string, number[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const list = syms.filter(Boolean).slice(0, 20);

    const load = async () => {
      for (const sym of list) {
        if (cancelled) break;
        const history = await getDailyHistory(sym, 1);
        if (!cancelled && history.length > 0) {
          const prices = history.map(h => h.price);
          setData(prev => new Map(prev).set(sym, prices));
        }
        await new Promise(r => setTimeout(r, 150));
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [syms.join(",")]);

  return data;
}
