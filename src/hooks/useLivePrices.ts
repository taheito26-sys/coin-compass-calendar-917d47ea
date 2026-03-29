/**
 * useLivePrices.ts
 *
 * Shared hook for real-time crypto prices.
 * - Binance REST bootstrap on mount
 * - Binance WebSocket for live tick updates
 * - Falls back to CoinGecko for coins not on Binance
 * - Multi-source market data (CoinGecko direct, CoinCap, Binance ticker)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getSpotPrices,
  subscribeLivePrices,
  getWsPrices,
  BINANCE_SYMBOLS,
  KNOWN_IDS,
  type SpotPrice,
} from "@/lib/priceProvider";
import { useCrypto } from "@/lib/cryptoContext";
import { normalizeSymbol } from "@/lib/symbolAliases";

export interface LiveCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  image: string;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}

// ─── Multi-source market data with cascading fallback ──────

let _marketCache: LiveCoin[] = [];
let _marketCacheTs = 0;
let _marketFetching = false;
let _marketListeners = new Set<() => void>();
let _lastSource = "";

const POLL_MS = 180_000;
const STALE_MS = 170_000;

function notifyListeners() {
  _marketListeners.forEach(cb => cb());
}

async function fetchCoinGeckoDirect(signal: AbortSignal): Promise<LiveCoin[]> {
  const url = (page: number) =>
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`;
  const r = await fetch(url(1), { signal });
  if (!r.ok) throw new Error(`CG ${r.status}`);
  const p1: any[] = await r.json();
  if (!p1.length) throw new Error("CG empty");
  try {
    await new Promise(r => setTimeout(r, 3000));
    const r2 = await fetch(url(2), { signal: AbortSignal.timeout(10000) });
    if (r2.ok) {
      const p2: any[] = await r2.json();
      if (p2.length) return [...p1, ...p2];
    }
  } catch {}
  return p1;
}

async function fetchCoinCapDirect(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch("https://api.coincap.io/v2/assets?limit=250", { signal });
  if (!r.ok) throw new Error(`CoinCap ${r.status}`);
  const { data } = await r.json();
  if (!data?.length) throw new Error("CoinCap empty");
  return data.map((c: any, i: number) => ({
    id: c.id, symbol: (c.symbol || "").toLowerCase(), name: c.name || c.id,
    current_price: parseFloat(c.priceUsd) || 0, market_cap: parseFloat(c.marketCapUsd) || 0,
    total_volume: parseFloat(c.volumeUsd24Hr) || 0, market_cap_rank: parseInt(c.rank) || i + 1,
    image: "", price_change_percentage_1h_in_currency: null,
    price_change_percentage_24h_in_currency: parseFloat(c.changePercent24Hr) || null,
    price_change_percentage_7d_in_currency: null,
  }));
}

async function fetchBinanceTickerDirect(signal: AbortSignal): Promise<LiveCoin[]> {
  const r = await fetch("https://api.binance.com/api/v3/ticker/24hr", { signal });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const data: any[] = await r.json();
  if (!data?.length) throw new Error("Binance empty");
  const seen = new Set<string>();
  const out: LiveCoin[] = [];
  for (const t of data) {
    if (!t.symbol?.endsWith("USDT")) continue;
    const base = t.symbol.replace("USDT", "").toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({
      id: base, symbol: base, name: base.toUpperCase(),
      current_price: parseFloat(t.lastPrice) || 0, market_cap: 0,
      total_volume: parseFloat(t.quoteVolume) || 0, market_cap_rank: out.length + 1,
      image: "", price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h_in_currency: parseFloat(t.priceChangePercent) || null,
      price_change_percentage_7d_in_currency: null,
    });
  }
  out.sort((a, b) => b.total_volume - a.total_volume);
  out.forEach((c, i) => { c.market_cap_rank = i + 1; });
  return out.slice(0, 500);
}

async function doMarketFetch() {
  if (_marketFetching) return;
  _marketFetching = true;
  try {
    // Direct browser requests — no Worker proxy needed
    const directSources: { name: string; fn: (s: AbortSignal) => Promise<LiveCoin[]> }[] = [
      { name: "CoinGecko", fn: fetchCoinGeckoDirect },
      { name: "CoinCap", fn: fetchCoinCapDirect },
      { name: "Binance", fn: fetchBinanceTickerDirect },
    ];

    for (const source of directSources) {
      try {
        const coins = await source.fn(AbortSignal.timeout(15000));
        if (coins.length > 0) {
          _marketCache = coins;
          _marketCacheTs = Date.now();
          _lastSource = `Direct:${source.name}`;
          console.log(`[Prices] Loaded ${coins.length} coins from ${source.name}`);
          notifyListeners();
          return;
        }
      } catch (err) {
        console.warn(`[Prices] ${source.name} failed:`, err instanceof Error ? err.message : err);
        continue;
      }
    }

    console.warn("[Prices] All sources failed, keeping stale cache");
  } finally {
    _marketFetching = false;
  }
}

const LS_CACHE_KEY = "lt_market_cache";
function persistCache() {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ ts: _marketCacheTs, src: _lastSource, data: _marketCache.slice(0, 500) }));
  } catch {}
}
function restoreCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return;
    const { ts, data } = JSON.parse(raw);
    if (data?.length && Date.now() - ts < 1_800_000) {
      _marketCache = data;
      _marketCacheTs = ts;
    }
  } catch {}
}

restoreCache();

let _pollIntervalId: number | null = null;

function ensureMarketPolling() {
  if (_pollIntervalId) return;
  if (Date.now() - _marketCacheTs > STALE_MS && !_marketFetching) {
    doMarketFetch().then(persistCache);
  }
  _pollIntervalId = window.setInterval(() => {
    if (Date.now() - _marketCacheTs > STALE_MS && !_marketFetching) {
      doMarketFetch().then(persistCache);
    }
  }, POLL_MS);
}

// ─── Shared hook ───────────────────────────────────────────

export function useLivePrices() {
  const { state } = useCrypto();

  const [marketCoins, setMarketCoins] = useState<LiveCoin[]>(_marketCache);
  const [marketLoading, setMarketLoading] = useState(_marketCache.length === 0);

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
      setMarketCoins(_marketCache);
      setMarketLoading(false);
    };
    _marketListeners.add(update);
    ensureMarketPolling();
    if (_marketCache.length > 0) { setMarketCoins(_marketCache); setMarketLoading(false); }
    return () => { _marketListeners.delete(update); };
  }, []);

  useEffect(() => {
    if (assetSymbols.length === 0) return;

    let cancelled = false;
    const assets = assetSymbols.map(sym => ({
      sym,
      coingeckoId: KNOWN_IDS[sym] || null,
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

  const cgPriceMap = useRef(new Map<string, LiveCoin>());
  useEffect(() => {
    const m = new Map<string, LiveCoin>();
    for (const c of marketCoins) m.set(c.symbol.toUpperCase(), c);
    cgPriceMap.current = m;
  }, [marketCoins]);

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
    const cg = cgPriceMap.current.get(key);
    const binance = mergedPrices[key];

    if (cg && binance) {
      return {
        ...cg,
        current_price: binance.price,
        price_change_percentage_24h_in_currency: binance.change24h,
      };
    }

    if (binance) {
      return {
        id: KNOWN_IDS[key] || key.toLowerCase(),
        symbol: key.toLowerCase(),
        name: key,
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

    if (cg) return cg;
    return null;
  }, [mergedPrices, marketCoins]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    coins: marketCoins,
    loading: marketLoading,
    getPrice,
    priceMap: cgPriceMap.current,
    spotPrices: mergedPrices,
  };
}
