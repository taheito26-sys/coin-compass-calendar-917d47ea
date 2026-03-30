import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSpotPrices,
  subscribeLivePrices,
  getWsPrices,
  type SpotPrice,
} from "@/lib/priceProvider";
import { refreshMarketData, getMarketCache, resolveCoin, addMarketListener, removeMarketListener, MarketCoin } from "@/lib/marketData";
import { useCrypto } from "@/lib/cryptoContext";
import { normalizeSymbol } from "@/lib/symbolAliases";

export type LiveCoin = MarketCoin;

export function useLivePrices() {
  const { state } = useCrypto();

  const [marketCoins, setMarketCoins] = useState<LiveCoin[]>(getMarketCache());
  const [marketLoading, setMarketLoading] = useState(getMarketCache().length === 0);

  const [spotPrices, setSpotPrices] = useState<Record<string, SpotPrice>>({});
  const [wsRevision, setWsRevision] = useState(0);
  const bootstrapDoneRef = useRef(false);

  const assetSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const tx of state.txs) {
      const sym = normalizeSymbol(tx.asset || "");
      if (sym) set.add(sym);
    }
    for (const w of state.watch || []) {
      set.add(w.toUpperCase());
    }
    return [...set];
  }, [state.txs, state.watch]);

  useEffect(() => {
    const update = () => {
      const cache = getMarketCache();
      setMarketCoins(cache);
      setMarketLoading(false);
    };
    addMarketListener(update);
    refreshMarketData();
    if (getMarketCache().length > 0) {
      setMarketCoins(getMarketCache());
      setMarketLoading(false);
    }
    return () => removeMarketListener(update);
  }, []);

  useEffect(() => {
    if (assetSymbols.length === 0) return;

    let cancelled = false;
    const assets = assetSymbols.map(sym => ({
      sym,
      coingeckoId: null, // Let provider handle discovery
    }));

    getSpotPrices(assets).then(prices => {
      if (!cancelled) {
        setSpotPrices(prices);
        bootstrapDoneRef.current = true;
      }
    });

    return () => { cancelled = true; };
  }, [assetSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (assetSymbols.length === 0) return;
    const unsub = subscribeLivePrices(assetSymbols, () => {
      setWsRevision(r => r + 1);
    });
    return unsub;
  }, [assetSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergedPrices = useMemo(() => {
    const ws = getWsPrices();
    const merged = { ...spotPrices };
    for (const [sym, p] of Object.entries(ws)) {
      merged[sym] = p;
    }
    return merged;
  }, [spotPrices, wsRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPrice = useCallback((sym: string): LiveCoin | null => {
    const key = sym.toUpperCase();
    
    // Use the smart resolver to find the coin regardless of alias/name/symbol
    const resolved = resolveCoin(key);
    const binance = mergedPrices[key] || (resolved ? mergedPrices[resolved.symbol.toUpperCase()] : null);

    if (resolved && binance) {
      return {
        ...resolved,
        current_price: binance.price,
        price_change_percentage_24h_in_currency: binance.change24h,
      };
    }

    if (binance) {
      return {
        id: resolved?.id || key.toLowerCase(),
        symbol: key.toLowerCase(),
        name: resolved?.name || key,
        current_price: binance.price,
        market_cap: 0,
        total_volume: 0,
        market_cap_rank: 9999,
        image: "",
        price_change_percentage_1h_in_currency: null,
        price_change_percentage_24h_in_currency: binance.change24h,
        price_change_percentage_7d_in_currency: null,
      };
    }

    if (resolved) return resolved;
    return null;
  }, [mergedPrices, marketCoins]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    coins: marketCoins,
    loading: marketLoading,
    getPrice,
    priceMap: null, // deprecated in favor of getPrice/resolveCoin
    spotPrices: mergedPrices,
  };
}
