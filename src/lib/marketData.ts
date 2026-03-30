/**
 * marketData.ts
 *
 * Automated discovery and indexing of crypto assets across multiple sources.
 * This library builds a global index of top coins to allow automatic resolution
 * of symbols, names, and IDs without manual hardcoding.
 */

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  market_cap_rank: number;
  image: string;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
}

let _cache: MarketCoin[] = [];
let _ts = 0;
let _fetching = false;
let _listeners = new Set<() => void>();

const STALE_MS = 300_000; // 5 minutes

export function getMarketCache() { return _cache; }
export function addMarketListener(cb: () => void) { _listeners.add(cb); }
export function removeMarketListener(cb: () => void) { _listeners.delete(cb); }

function notify() { _listeners.forEach(cb => cb()); }

/** Dynamic symbol resolution: searches by symbol, then name, then id */
export function resolveCoin(query: string): MarketCoin | null {
  const q = query.trim().toUpperCase();
  if (!q) return null;

  // 1. Direct symbol match
  const bySym = _cache.find(c => c.symbol.toUpperCase() === q);
  if (bySym) return bySym;

  // 2. Name match
  const byName = _cache.find(c => c.name.toUpperCase() === q);
  if (byName) return byName;

  // 3. ID match
  const byId = _cache.find(c => c.id.toUpperCase() === q || c.id.toLowerCase() === q.toLowerCase());
  if (byId) return byId;

  // 4. Fuzzy symbol (strip common prefixes/suffixes)
  const normalized = q.replace(/COIN$/i, "").replace(/^1000/, "");
  if (normalized !== q) {
    const fuzzy = _cache.find(c => c.symbol.toUpperCase() === normalized);
    if (fuzzy) return fuzzy;
  }

  return null;
}

async function fetchCG() {
  const url = (page: number) =>
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`;
  
  const r = await fetch(url(1));
  if (!r.ok) throw new Error("CG failed");
  const p1 = await r.json();
  
  try {
    // Attempt page 2 for top 500
    const r2 = await fetch(url(2), { signal: AbortSignal.timeout(5000) });
    if (r2.ok) {
      const p2 = await r2.json();
      return [...p1, ...p2];
    }
  } catch {}
  return p1;
}

async function fetchBinance() {
  const r = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  const data = await r.json();
  const seen = new Set<string>();
  const out: any[] = [];
  
  for (const t of data) {
    if (!t.symbol.endsWith("USDT")) continue;
    const base = t.symbol.replace("USDT", "").toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({
      id: base, symbol: base, name: base.toUpperCase(),
      current_price: parseFloat(t.lastPrice) || 0,
      total_volume: parseFloat(t.quoteVolume) || 0,
      price_change_percentage_24h: parseFloat(t.priceChangePercent) || 0,
    });
  }
  return out.sort((a, b) => b.total_volume - a.total_volume).slice(0, 500);
}

export async function refreshMarketData(force = false) {
  if (_fetching) return;
  if (!force && Date.now() - _ts < STALE_MS && _cache.length > 0) return;

  _fetching = true;
  try {
    const sources = [
      { name: "CoinGecko", fn: fetchCG },
      { name: "Binance", fn: fetchBinance },
    ];

    for (const src of sources) {
      try {
        const data = await src.fn();
        if (data && data.length > 0) {
          _cache = data.map((c: any, i: number) => ({
            id: c.id,
            symbol: c.symbol,
            name: c.name || c.symbol.toUpperCase(),
            current_price: c.current_price || 0,
            market_cap: c.market_cap || 0,
            total_volume: c.total_volume || 0,
            market_cap_rank: c.market_cap_rank || i + 1,
            image: c.image || "",
            price_change_percentage_1h_in_currency: c.price_change_percentage_1h_in_currency || null,
            price_change_percentage_24h_in_currency: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null,
            price_change_percentage_7d_in_currency: c.price_change_percentage_7d_in_currency || null,
          }));
          _ts = Date.now();
          console.log(`[MarketData] Refreshed ${_cache.length} coins from ${src.name}`);
          notify();
          return;
        }
      } catch (err) {
        console.warn(`[MarketData] ${src.name} failed:`, err);
      }
    }
  } finally {
    _fetching = false;
  }
}
