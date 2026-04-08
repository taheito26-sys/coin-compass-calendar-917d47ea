/**
 * sentiment-feed — Live sentiment engine for top 100 crypto coins
 * Aggregates from FREE public APIs, persists to sentiment_cache table
 * Sources: CoinGecko (trending, categories, global), Reddit, Alternative.me F&G
 * Runs on pg_cron every 5 min — frontend just reads cached data
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Top 100 coin symbols for extraction ───
const TOP_100_SYMBOLS = [
  "BTC","ETH","BNB","SOL","XRP","DOGE","ADA","AVAX","DOT","MATIC",
  "LINK","UNI","SHIB","ARB","OP","LTC","BCH","NEAR","APT","FIL",
  "ICP","ATOM","XLM","HBAR","VET","ALGO","GRT","FTM","AAVE","EOS",
  "SAND","MANA","AXS","THETA","EGLD","FLOW","CHZ","ENJ","GALA","IMX",
  "LDO","RPL","SSV","CRV","MKR","SNX","COMP","SUSHI","YFI","BAL",
  "DYDX","GMX","PENDLE","RUNE","INJ","TIA","SEI","SUI","PEPE","WIF",
  "FLOKI","BONK","ORDI","STX","KASPA","TON","TRX","LEO","OKB","CRO",
  "RNDR","FET","AGIX","OCEAN","WLD","TAO","AR","HNT","ROSE","ZIL",
  "ONE","KAVA","CELO","OSMO","AKT","TWT","QNT","XMR","ZEC","DASH",
  "NEO","IOTA","XTZ","MINA","CFX","BLUR","APE","1INCH","ANKR","ENS",
];

// Build regex patterns dynamically for all 100 coins (symbol + common names)
const COIN_NAME_MAP: Record<string, string[]> = {
  BTC: ["bitcoin"], ETH: ["ethereum"], BNB: ["binance"], SOL: ["solana"],
  XRP: ["ripple"], DOGE: ["dogecoin"], ADA: ["cardano"], AVAX: ["avalanche"],
  DOT: ["polkadot"], MATIC: ["polygon"], LINK: ["chainlink"], UNI: ["uniswap"],
  SHIB: ["shiba"], ARB: ["arbitrum"], LTC: ["litecoin"], NEAR: ["near protocol"],
  APT: ["aptos"], FIL: ["filecoin"], ICP: ["internet computer"], ATOM: ["cosmos"],
  PEPE: ["pepe"], TON: ["toncoin"], TRX: ["tron"], SUI: ["sui"],
  INJ: ["injective"], SEI: ["sei"], TIA: ["celestia"], RUNE: ["thorchain"],
  RNDR: ["render"], FET: ["fetch"], WLD: ["worldcoin"], TAO: ["bittensor"],
  AR: ["arweave"], MKR: ["maker"], AAVE: ["aave"], SNX: ["synthetix"],
};

const COIN_PATTERNS = TOP_100_SYMBOLS.map(s => {
  const names = COIN_NAME_MAP[s] || [];
  const patterns = [s, ...names].map(p => `\\b${p.replace(/\$/g, "\\$")}\\b`);
  return { sym: s, re: new RegExp(patterns.join("|"), "i") };
});

function extractCoins(text: string): string[] {
  const coins: string[] = [];
  for (const { sym, re } of COIN_PATTERNS) {
    if (re.test(text)) coins.push(sym);
  }
  return [...new Set(coins)];
}

// ─── Sentiment Analysis ───
const BULLISH_WORDS = new Set([
  "bull","bullish","surge","rally","moon","pump","breakout","gain","soar","rocket",
  "ath","buy","long","uptrend","recovery","green","optimistic","accumulate","hodl",
  "adoption","upgrade","partnership","launch","listing","institutional","whale buying",
]);
const BEARISH_WORDS = new Set([
  "bear","bearish","crash","dump","drop","plunge","sell","short","decline","dip",
  "scam","rug","hack","exploit","fear","panic","liquidat","capitulat","red","loss",
  "ban","regulation","sec","lawsuit","delisting","bankrupt","insolvent",
]);

function analyzeSentiment(text: string): { sentiment: "bullish"|"bearish"|"neutral"; score: number } {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  let bullCount = 0, bearCount = 0;
  for (const w of words) {
    if (BULLISH_WORDS.has(w)) bullCount++;
    if (BEARISH_WORDS.has(w)) bearCount++;
  }
  const total = bullCount + bearCount;
  if (total === 0) return { sentiment: "neutral", score: 0 };
  const score = (bullCount - bearCount) / total; // -1 to 1
  const sentiment = score > 0.15 ? "bullish" : score < -0.15 ? "bearish" : "neutral";
  return { sentiment, score };
}

// ─── Types ───
interface NewsItem {
  id: string; title: string; url: string; source: string; sourceIcon: string;
  sentiment: "bullish"|"bearish"|"neutral"; sentimentScore: number;
  timestamp: number; category: string; coins: string[]; engagement: number;
}

interface TrendingCoin {
  id: string; symbol: string; name: string; thumb: string;
  marketCapRank: number|null; priceChangePercent24h: number|null; score: number;
}

interface CoinSentiment {
  symbol: string; name: string; mentions: number;
  avgSentiment: number; sentiment: "bullish"|"bearish"|"neutral";
  price: number; change24h: number|null; marketCapRank: number;
  image: string;
}

interface SentimentData {
  news: NewsItem[];
  trending: TrendingCoin[];
  fearGreed: { value: number; label: string; history: { value: number; ts: number }[] };
  marketDominance: { btc: number; eth: number; others: number };
  communityBuzz: { topic: string; mentions: number; sentiment: string }[];
  coinSentiments: CoinSentiment[];
  lastUpdated: number;
}

// ─── Fetchers ───

async function fetchReddit(subreddit: string): Promise<NewsItem[]> {
  try {
    const r = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=50`, {
      headers: { "User-Agent": "CoinCompass/2.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const json = await r.json();
    return (json?.data?.children || [])
      .filter((p: any) => p.data && !p.data.stickied && p.data.score > 5)
      .map((p: any) => {
        const d = p.data;
        const text = `${d.title} ${d.selftext || ""}`;
        const { sentiment, score } = analyzeSentiment(text);
        return {
          id: `reddit_${d.id}`, title: d.title,
          url: `https://reddit.com${d.permalink}`,
          source: `r/${subreddit}`, sourceIcon: "🟠",
          sentiment, sentimentScore: score,
          timestamp: d.created_utc * 1000, category: "community",
          coins: extractCoins(text),
          engagement: d.score + (d.num_comments || 0),
        };
      });
  } catch { return []; }
}

async function fetchCoinGeckoTrending(): Promise<TrendingCoin[]> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/search/trending", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const json = await r.json();
    return (json.coins || []).map((c: any, i: number) => ({
      id: c.item.id, symbol: c.item.symbol, name: c.item.name,
      thumb: c.item.thumb || c.item.small || "",
      marketCapRank: c.item.market_cap_rank || null,
      priceChangePercent24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
      score: i + 1,
    }));
  } catch { return []; }
}

async function fetchCoinGeckoTop100(): Promise<any[]> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function fetchCategoryNews(): Promise<NewsItem[]> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/categories", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const cats = await r.json();
    return cats
      .filter((c: any) => c.market_cap_change_24h != null && Math.abs(c.market_cap_change_24h) > 3)
      .slice(0, 20)
      .map((c: any) => {
        const change = c.market_cap_change_24h;
        const { sentiment, score } = analyzeSentiment(
          change > 5 ? "surge rally bullish gain" : change < -5 ? "drop decline bearish loss" : "stable neutral"
        );
        return {
          id: `cat_${c.id}`,
          title: `${c.name}: ${change > 0 ? "+" : ""}${change.toFixed(1)}% market cap change (24h)`,
          url: `https://www.coingecko.com/en/categories/${c.id}`,
          source: "CoinGecko", sourceIcon: "🦎",
          sentiment, sentimentScore: score,
          timestamp: Date.now(), category: "market",
          coins: [], engagement: c.top_3_coins?.length || 0,
        };
      });
  } catch { return []; }
}

async function fetchFearGreed() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=30&format=json", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error();
    const json = await r.json();
    const current = json.data[0];
    return {
      value: parseInt(current.value),
      label: current.value_classification,
      history: json.data.map((d: any) => ({ value: parseInt(d.value), ts: parseInt(d.timestamp) * 1000 })),
    };
  } catch { return { value: 50, label: "Neutral", history: [] }; }
}

async function fetchMarketDominance() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/global", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error();
    const json = await r.json();
    const d = json.data.market_cap_percentage;
    return { btc: d.btc || 0, eth: d.eth || 0, others: 100 - (d.btc || 0) - (d.eth || 0) };
  } catch { return { btc: 50, eth: 18, others: 32 }; }
}

// ─── Aggregation ───

function aggregateBuzz(news: NewsItem[]): { topic: string; mentions: number; sentiment: string }[] {
  const m = new Map<string, { count: number; sentSum: number }>();
  for (const n of news) {
    for (const coin of n.coins) {
      const e = m.get(coin) || { count: 0, sentSum: 0 };
      e.count++; e.sentSum += n.sentimentScore;
      m.set(coin, e);
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([topic, data]) => ({
      topic, mentions: data.count,
      sentiment: data.sentSum > 0.3 ? "bullish" : data.sentSum < -0.3 ? "bearish" : "neutral",
    }));
}

function buildCoinSentiments(news: NewsItem[], top100: any[]): CoinSentiment[] {
  // Aggregate mentions + sentiment from news
  const mentionMap = new Map<string, { count: number; sentSum: number }>();
  for (const n of news) {
    for (const coin of n.coins) {
      const e = mentionMap.get(coin) || { count: 0, sentSum: 0 };
      e.count++; e.sentSum += n.sentimentScore;
      mentionMap.set(coin, e);
    }
  }

  // Build sentiment for each top 100 coin
  const results: CoinSentiment[] = [];
  for (const c of top100) {
    const sym = (c.symbol || "").toUpperCase();
    const mention = mentionMap.get(sym);
    const mentions = mention?.count || 0;
    const avgSent = mentions > 0 ? (mention!.sentSum / mentions) : 0;

    results.push({
      symbol: sym,
      name: c.name || sym,
      mentions,
      avgSentiment: avgSent,
      sentiment: avgSent > 0.15 ? "bullish" : avgSent < -0.15 ? "bearish" : "neutral",
      price: c.current_price || 0,
      change24h: c.price_change_percentage_24h ?? null,
      marketCapRank: c.market_cap_rank || 999,
      image: c.image || "",
    });
  }

  return results.sort((a, b) => b.mentions - a.mentions || a.marketCapRank - b.marketCapRank);
}

// ─── Supabase client ───

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

async function persistToCache(data: SentimentData) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("sentiment_cache").upsert(
      { key: "latest", payload: data, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    console.log("[sentiment-feed] Persisted to cache");

    // Persist daily sentiment history snapshots
    await persistSentimentHistory(sb, data);
  } catch (err) {
    console.error("[sentiment-feed] Cache persist error:", err);
  }
}

async function persistSentimentHistory(sb: any, data: SentimentData) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Persist ALL top coins, using price movement as proxy sentiment for coins with 0 mentions
    const rows = data.coinSentiments.map(c => {
      let score: number;
      if (c.mentions > 0) {
        score = Math.round(((c.avgSentiment + 1) / 2) * 100); // -1..1 → 0..100
      } else {
        // Derive sentiment from price action for coins without mentions
        const change = c.change24h ?? 0;
        score = Math.max(0, Math.min(100, 50 + change * 2)); // neutral baseline + price skew
      }

      return {
        token_symbol: c.symbol.toUpperCase(),
        sentiment_score: Math.round(score),
        source: c.mentions > 0 ? "aggregate" : "price_derived",
        mention_count: c.mentions,
        snapshot_date: today,
      };
    }).filter(r => r.token_symbol);

    if (rows.length === 0) return;

    // Check if we already have entries for today to avoid duplicates
    const { data: existing } = await sb
      .from("sentiment_history")
      .select("token_symbol")
      .eq("snapshot_date", today)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log("[sentiment-feed] History already recorded for today, skipping");
      return;
    }

    const { error } = await sb.from("sentiment_history").insert(rows);
    if (error) {
      console.error("[sentiment-feed] History insert error:", error);
    } else {
      console.log(`[sentiment-feed] Persisted ${rows.length} sentiment history rows for ${today}`);
    }
  } catch (err) {
    console.error("[sentiment-feed] History persist error:", err);
  }
}

async function readCache(): Promise<SentimentData | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb.from("sentiment_cache").select("payload, updated_at").eq("key", "latest").single();
    if (data) return data.payload as SentimentData;
  } catch {}
  return null;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Check if caller just wants cached data (GET or body.cached=true)
    let wantCached = req.method === "GET";
    if (!wantCached) {
      try {
        const body = await req.clone().json();
        wantCached = body?.cached === true;
      } catch {}
    }

    if (wantCached) {
      const cached = await readCache();
      if (cached && Date.now() - cached.lastUpdated < 600_000) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Full fetch from all sources concurrently
    const [
      redditCrypto, redditBitcoin, redditDefi, redditAltcoin,
      trending, top100, categoryNews, fearGreed, dominance,
    ] = await Promise.allSettled([
      fetchReddit("CryptoCurrency"),
      fetchReddit("Bitcoin"),
      fetchReddit("defi"),
      fetchReddit("altcoin"),
      fetchCoinGeckoTrending(),
      fetchCoinGeckoTop100(),
      fetchCategoryNews(),
      fetchFearGreed(),
      fetchMarketDominance(),
    ]);

    const allNews: NewsItem[] = [
      ...(redditCrypto.status === "fulfilled" ? redditCrypto.value : []),
      ...(redditBitcoin.status === "fulfilled" ? redditBitcoin.value : []),
      ...(redditDefi.status === "fulfilled" ? redditDefi.value : []),
      ...(redditAltcoin.status === "fulfilled" ? redditAltcoin.value : []),
      ...(categoryNews.status === "fulfilled" ? categoryNews.value : []),
    ];

    // Deduplicate
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; });
    uniqueNews.sort((a, b) => b.engagement - a.engagement || b.timestamp - a.timestamp);

    const top100Data = top100.status === "fulfilled" ? top100.value : [];

    const result: SentimentData = {
      news: uniqueNews.slice(0, 75),
      trending: trending.status === "fulfilled" ? trending.value : [],
      fearGreed: fearGreed.status === "fulfilled" ? fearGreed.value : { value: 50, label: "Neutral", history: [] },
      marketDominance: dominance.status === "fulfilled" ? dominance.value : { btc: 50, eth: 18, others: 32 },
      communityBuzz: aggregateBuzz(uniqueNews),
      coinSentiments: buildCoinSentiments(uniqueNews, top100Data),
      lastUpdated: Date.now(),
    };

    // Persist in background
    persistToCache(result).catch(() => {});

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sentiment feed error:", err);
    // Try returning cached data on error
    const cached = await readCache();
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Failed to fetch sentiment data" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
