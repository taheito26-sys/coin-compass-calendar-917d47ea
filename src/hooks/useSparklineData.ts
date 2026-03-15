import { useState, useEffect, useRef } from "react";
import { getDailyHistory } from "@/lib/priceProvider";

/**
 * Fetches real 7-day sparkline data for a batch of symbols using the priceProvider.
 * Rate-limited to avoid hammering the APIs, though Binance scale supports more.
 */
export function useSparklineData(syms: string[]) {
  const [data, setData] = useState<Map<string, number[]>>(new Map());
  const queueRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    queueRef.current = syms.filter(Boolean).slice(0, 20); // Limit to 20

    (async () => {
      for (const sym of queueRef.current) {
        if (cancelled) break;
        // getDailyHistory uses Binance first (high rate limit) then falls back to CG Proxy
        const history = await getDailyHistory(sym, 7);
        if (!cancelled && history.length > 0) {
          const prices = history.map(h => h.price);
          setData(prev => new Map(prev).set(sym, prices));
        }
        await new Promise(r => setTimeout(r, 200)); // slight delay
      }
    })();

    return () => { cancelled = true; };
  }, [syms.join(",")]);

  return data;
}
