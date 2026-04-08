/**
 * sentiment-feed — Aggregates crypto sentiment & news from FREE public APIs
 * Sources:
 *   1. CoinGecko Trending (no key)
 *   2. Reddit r/cryptocurrency + r/bitcoin JSON feeds (no key)
 *   3. CoinGecko status updates (no key)
 *   4. Alternative.me Fear & Greed history (no key)
 *   5. CoinGecko global data for market dominance (no key)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceIcon: string;
  sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number; // -1 to 1
  timestamp: number;
  category: string;
  coins: string[];
  engagement: number;
}

interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  marketCapRank: number | null;
  priceChangePercent24h: number | null;
  score: number;
}

interface SentimentData {
  news: NewsItem[];
  trending: TrendingCoin[];
  fearGreed: { value: number; label: string; history: { value: number; ts: number }[] };
  marketDominance: { btc: number; eth: number; others: number };
  communityBuzz: { topic: string; mentions: number; sentiment: string }[];
  lastUpdated: number;
}

// ─── Sentiment analysis (keyword-based, no AI needed) ───
const BULLISH_WORDS = [
  "bull", "pump", "moon", "rally", "surge", "soar", "breakout", "ath", "all-time high",
  "adoption", "partnership", "approved", "launch", "upgrade", "milestone", "record",
  "growth", "gain", "profit", "win", "buy", "long", "accumulate", "bullish", "🚀", "📈",
  "institutional", "etf", "halving", "support",
];

const BEARISH_WORDS = [
  "bear", "dump", "crash", "drop", "fall", "plunge", "decline", "sell", "short",
  "hack", "exploit", "rug", "scam", "fraud", "ban", "regulate", "fear", "panic",
  "liquidat", "bankrupt", "collapse", "warning", "risk", "bearish", "📉", "🔴",
  "lawsuit", "sec", "fine", "penalty",
];

function analyzeSentiment(text: string): { sentiment: "bullish" | "bearish" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of BULLISH_WORDS) if (lower.includes(w)) score += 1;
  for (const w of BEARISH_WORDS) if (lower.includes(w)) score -= 1;
  const normalized = Math.max(-1, Math.min(1, score / 3));
  const sentiment = normalized > 0.15 ? "bullish" : normalized < -0.15 ? "bearish" : "neutral";
  return { sentiment, score: normalized };
}

function extractCoins(text: string): string[] {
  const coins: string[] = [];
  const patterns = [
    /\b(BTC|Bitcoin)\b/i, /\b(ETH|Ethereum)\b/i, /\b(SOL|Solana)\b/i,
    /\b(BNB)\b/i, /\b(XRP|Ripple)\b/i, /\b(ADA|Cardano)\b/i,
    /\b(DOGE|Dogecoin)\b/i, /\b(AVAX|Avalanche)\b/i, /\b(DOT|Polkadot)\b/i,
    /\b(MATIC|Polygon)\b/i, /\b(LINK|Chainlink)\b/i, /\b(UNI|Uniswap)\b/i,
    /\b(SHIB)\b/i, /\b(ARB|Arbitrum)\b/i, /\b(OP|Optimism)\b/i,
  ];
  for (const p of patterns) {
    if (p.test(text)) {
      const m = text.match(p);
      if (m) coins.push(m[1].toUpperCase());
    }
  }
  return [...new Set(coins)];
}

// ─── Source fetchers ───

async function fetchReddit(subreddit: string): Promise<NewsItem[]> {
  try {
    const r = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
      headers: { "User-Agent": "CoinCompass/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const json = await r.json();
    const posts = json?.data?.children || [];
    return posts
      .filter((p: any) => p.data && !p.data.stickied && p.data.score > 10)
      .map((p: any) => {
        const d = p.data;
        const { sentiment, score } = analyzeSentiment(`${d.title} ${d.selftext || ""}`);
        return {
          id: `reddit_${d.id}`,
          title: d.title,
          url: `https://reddit.com${d.permalink}`,
          source: `r/${subreddit}`,
          sourceIcon: "🟠",
          sentiment,
          sentimentScore: score,
          timestamp: d.created_utc * 1000,
          category: "community",
          coins: extractCoins(`${d.title} ${d.selftext || ""}`),
          engagement: d.score + (d.num_comments || 0),
        };
      });
  } catch {
    return [];
  }
}

async function fetchCoinGeckoTrending(): Promise<TrendingCoin[]> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/search/trending", {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const json = await r.json();
    return (json.coins || []).map((c: any, i: number) => ({
      id: c.item.id,
      symbol: c.item.symbol,
      name: c.item.name,
      thumb: c.item.thumb || c.item.small || "",
      marketCapRank: c.item.market_cap_rank || null,
      priceChangePercent24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
      score: i + 1,
    }));
  } catch {
    return [];
  }
}

async function fetchCoinGeckoStatusUpdates(): Promise<NewsItem[]> {
  try {
    // Use CoinGecko's categories list for market context (free, no key)
    const r = await fetch("https://api.coingecko.com/api/v3/coins/categories", {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const cats = await r.json();
    // Generate "news" from top movers in categories
    return cats
      .filter((c: any) => c.market_cap_change_24h != null && Math.abs(c.market_cap_change_24h) > 3)
      .slice(0, 15)
      .map((c: any) => {
        const change = c.market_cap_change_24h;
        const { sentiment, score } = analyzeSentiment(
          change > 5 ? "surge rally bullish gain" : change < -5 ? "drop decline bearish loss" : "stable neutral"
        );
        return {
          id: `cat_${c.id}`,
          title: `${c.name}: ${change > 0 ? "+" : ""}${change.toFixed(1)}% market cap change (24h)`,
          url: `https://www.coingecko.com/en/categories/${c.id}`,
          source: "CoinGecko",
          sourceIcon: "🦎",
          sentiment,
          sentimentScore: score,
          timestamp: Date.now(),
          category: "market",
          coins: [],
          engagement: c.top_3_coins?.length || 0,
        };
      });
  } catch {
    return [];
  }
}

async function fetchFearGreed() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=30&format=json", {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error();
    const json = await r.json();
    const current = json.data[0];
    return {
      value: parseInt(current.value),
      label: current.value_classification,
      history: json.data.map((d: any) => ({
        value: parseInt(d.value),
        ts: parseInt(d.timestamp) * 1000,
      })),
    };
  } catch {
    return { value: 50, label: "Neutral", history: [] };
  }
}

async function fetchMarketDominance() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/global", {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error();
    const json = await r.json();
    const d = json.data.market_cap_percentage;
    return {
      btc: d.btc || 0,
      eth: d.eth || 0,
      others: 100 - (d.btc || 0) - (d.eth || 0),
    };
  } catch {
    return { btc: 50, eth: 18, others: 32 };
  }
}

// ─── Community buzz aggregation ───
function aggregateBuzz(news: NewsItem[]): { topic: string; mentions: number; sentiment: string }[] {
  const topicMap = new Map<string, { count: number; sentSum: number }>();
  for (const n of news) {
    for (const coin of n.coins) {
      const existing = topicMap.get(coin) || { count: 0, sentSum: 0 };
      existing.count++;
      existing.sentSum += n.sentimentScore;
      topicMap.set(coin, existing);
    }
  }
  return [...topicMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([topic, data]) => ({
      topic,
      mentions: data.count,
      sentiment: data.sentSum > 0.3 ? "bullish" : data.sentSum < -0.3 ? "bearish" : "neutral",
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Fetch all sources concurrently
    const [
      redditCrypto,
      redditBitcoin,
      redditDefi,
      trending,
      categoryNews,
      fearGreed,
      dominance,
    ] = await Promise.allSettled([
      fetchReddit("CryptoCurrency"),
      fetchReddit("Bitcoin"),
      fetchReddit("defi"),
      fetchCoinGeckoTrending(),
      fetchCoinGeckoStatusUpdates(),
      fetchFearGreed(),
      fetchMarketDominance(),
    ]);

    const allNews: NewsItem[] = [
      ...(redditCrypto.status === "fulfilled" ? redditCrypto.value : []),
      ...(redditBitcoin.status === "fulfilled" ? redditBitcoin.value : []),
      ...(redditDefi.status === "fulfilled" ? redditDefi.value : []),
      ...(categoryNews.status === "fulfilled" ? categoryNews.value : []),
    ];

    // Deduplicate by id
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });

    // Sort by engagement then time
    uniqueNews.sort((a, b) => b.engagement - a.engagement || b.timestamp - a.timestamp);

    const result: SentimentData = {
      news: uniqueNews.slice(0, 50),
      trending: trending.status === "fulfilled" ? trending.value : [],
      fearGreed: fearGreed.status === "fulfilled" ? fearGreed.value : { value: 50, label: "Neutral", history: [] },
      marketDominance: dominance.status === "fulfilled" ? dominance.value : { btc: 50, eth: 18, others: 32 },
      communityBuzz: aggregateBuzz(uniqueNews),
      lastUpdated: Date.now(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Sentiment feed error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch sentiment data" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
