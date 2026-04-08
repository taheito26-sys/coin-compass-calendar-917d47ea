import { useEffect, useRef, useCallback } from "react";
import { subscribeLivePrices, getWsPrices } from "@/lib/priceProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Monitors trending sentiment coins via Binance WebSocket.
 * Alerts when any coin moves >5% from its price 1 hour ago.
 */

interface PriceSnapshot {
  price: number;
  ts: number;
}

const ALERT_THRESHOLD = 5; // percent
const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min cooldown per coin

export function useSentimentAlerts() {
  const historyRef = useRef<Map<string, PriceSnapshot[]>>(new Map());
  const alertedRef = useRef<Map<string, number>>(new Map());
  const trendingRef = useRef<string[]>([]);

  // Fetch trending coins from cached sentiment data
  const fetchTrending = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("sentiment_cache")
        .select("payload")
        .eq("key", "latest")
        .single();

      if (!data?.payload) return;
      const payload = data.payload as any;

      const symbols: string[] = [];

      // Top trending coins
      for (const t of payload.trending || []) {
        symbols.push(t.symbol.toUpperCase());
      }

      // Top mentioned coins from community buzz
      for (const b of payload.communityBuzz || []) {
        symbols.push(b.topic.toUpperCase());
      }

      // Top coin sentiments with mentions
      for (const c of (payload.coinSentiments || []).slice(0, 30)) {
        if (c.mentions > 0) symbols.push(c.symbol.toUpperCase());
      }

      trendingRef.current = [...new Set(symbols)];
    } catch {}
  }, []);

  // Check for alerts on each price tick
  const checkAlerts = useCallback(() => {
    const now = Date.now();
    const wsPrices = getWsPrices();

    for (const sym of trendingRef.current) {
      const sp = wsPrices[sym];
      if (!sp || !sp.price) continue;

      // Record price snapshot
      const history = historyRef.current.get(sym) || [];
      history.push({ price: sp.price, ts: now });

      // Keep only last 2 hours of data
      const cutoff = now - 2 * HOUR_MS;
      const trimmed = history.filter(h => h.ts > cutoff);
      historyRef.current.set(sym, trimmed);

      // Find price from ~1 hour ago
      const hourAgo = now - HOUR_MS;
      const oldSnapshot = trimmed.find(h => h.ts <= hourAgo + 5 * 60000 && h.ts >= hourAgo - 5 * 60000);
      if (!oldSnapshot) continue;

      const changePct = ((sp.price - oldSnapshot.price) / oldSnapshot.price) * 100;

      if (Math.abs(changePct) >= ALERT_THRESHOLD) {
        // Check cooldown
        const lastAlert = alertedRef.current.get(sym) || 0;
        if (now - lastAlert < COOLDOWN_MS) continue;

        alertedRef.current.set(sym, now);

        if (changePct > 0) {
          toast.success(`🚀 ${sym} surged +${changePct.toFixed(1)}% in the last hour`, {
            description: `$${sp.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} — Trending sentiment coin`,
            duration: 10000,
          });
        } else {
          toast.error(`📉 ${sym} dropped ${changePct.toFixed(1)}% in the last hour`, {
            description: `$${sp.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} — Trending sentiment coin`,
            duration: 10000,
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    fetchTrending();
    // Re-fetch trending list every 5 min
    const trendingInterval = setInterval(fetchTrending, 5 * 60 * 1000);

    return () => clearInterval(trendingInterval);
  }, [fetchTrending]);

  // Subscribe to WS for trending coins
  useEffect(() => {
    if (trendingRef.current.length === 0) {
      // Wait for trending data, retry in 5s
      const t = setTimeout(() => {
        if (trendingRef.current.length > 0) {
          // Re-trigger by updating trending
        }
      }, 5000);
      return () => clearTimeout(t);
    }

    const unsub = subscribeLivePrices(trendingRef.current, checkAlerts);

    // Also check every 30s in case WS is slow
    const checkInterval = setInterval(checkAlerts, 30_000);

    return () => {
      unsub();
      clearInterval(checkInterval);
    };
  }, [trendingRef.current.length, checkAlerts]);
}
