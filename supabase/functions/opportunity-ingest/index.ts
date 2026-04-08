import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NormalizedEvent {
  token_symbol: string;
  token_name?: string;
  contract_address?: string;
  chain?: string;
  exchange: string;
  pair?: string;
  event_type: string;
  status: string;
  source_url?: string;
  announcement_time?: string;
  detected_time: string;
  confidence_score: number;
  lead_time_minutes?: number;
  raw_payload?: string;
  dedup_hash: string;
}

// ── SHA-256 dedup hash ──────────────────────────────────────────────
async function dedupHash(symbol: string, exchange: string, eventType: string): Promise<string> {
  // 30-min window bucket
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const data = `${symbol}|${exchange}|${eventType}|${bucket}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Confidence scoring ──────────────────────────────────────────────
function computeConfidence(event: Partial<NormalizedEvent>, isOfficial: boolean, multiExchange: boolean): number {
  let score = isOfficial ? 80 : 50;
  if (multiExchange) score += 10;
  if (event.event_type === "deposit_open") score += 5;
  if (event.event_type === "trading_live") score += 5;
  if (!isOfficial) score -= 30;
  return Math.max(0, Math.min(100, score));
}

// ── Lead time ───────────────────────────────────────────────────────
function computeLeadTime(announcementTime?: string, detectedTime?: string): number | null {
  if (!announcementTime || !detectedTime) return null;
  const diff = new Date(detectedTime).getTime() - new Date(announcementTime).getTime();
  return Math.round(diff / 60000);
}

// ── ADAPTER: Binance ────────────────────────────────────────────────
async function fetchBinance(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    // Binance announcements API
    const res = await fetch(
      "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=20",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const data = await res.json();
    const articles = data?.data?.catalogs?.[0]?.articles ?? data?.data?.articles ?? [];

    for (const a of articles) {
      const title = (a.title || "").toUpperCase();
      let eventType = "listing";
      let status = "announced";

      if (title.includes("DELIST") || title.includes("REMOVAL")) { eventType = "delisting"; status = "confirmed"; }
      else if (title.includes("AIRDROP") || title.includes("DISTRIBUTION")) { eventType = "airdrop"; status = "announced"; }
      else if (title.includes("FUTURES") || title.includes("PERPETUAL")) { eventType = "futures_listing"; }
      else if (title.includes("WILL LIST") || title.includes("ADDS")) { eventType = "listing"; status = "confirmed"; }
      else if (!title.includes("LIST")) continue;

      // Extract token symbols from title (pattern: "XXX" or "(XXX)")
      const symbolMatch = title.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : title.split(" ").find((w: string) => /^[A-Z]{2,8}$/.test(w)) || "UNKNOWN";

      const hash = await dedupHash(symbol, "binance", eventType);
      events.push({
        token_symbol: symbol.toUpperCase().trim(),
        token_name: a.title,
        exchange: "binance",
        event_type: eventType,
        status,
        source_url: `https://www.binance.com/en/support/announcement/${a.code || ""}`,
        announcement_time: a.releaseDate ? new Date(a.releaseDate).toISOString() : undefined,
        detected_time: new Date().toISOString(),
        confidence_score: computeConfidence({ event_type: eventType }, true, false),
        lead_time_minutes: computeLeadTime(
          a.releaseDate ? new Date(a.releaseDate).toISOString() : undefined,
          new Date().toISOString()
        ),
        raw_payload: JSON.stringify(a).slice(0, 2000),
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("Binance adapter error:", err);
  }
  return events;
}

// ── ADAPTER: CoinGecko New Coins ────────────────────────────────────
async function fetchCoinGeckoNewCoins(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const coins = await res.json();
    // Take last 20 as "new" (CoinGecko doesn't have a dedicated new coins endpoint on free tier)
    const recent = Array.isArray(coins) ? coins.slice(-20) : [];

    for (const c of recent) {
      const symbol = (c.symbol || "").toUpperCase().trim();
      if (!symbol || symbol.length < 2) continue;
      const hash = await dedupHash(symbol, "coingecko", "new_asset");
      events.push({
        token_symbol: symbol,
        token_name: c.name || symbol,
        exchange: "coingecko",
        event_type: "new_asset",
        status: "live",
        source_url: `https://www.coingecko.com/en/coins/${c.id}`,
        detected_time: new Date().toISOString(),
        confidence_score: 70,
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("CoinGecko adapter error:", err);
  }
  return events;
}

// ── ADAPTER: Stub adapters for KuCoin, OKX, Bybit, Coinbase ────────
// These use public announcement pages; full HTML parsing requires more infra.
// For now they attempt API-based fetches with graceful fallback.

async function fetchKuCoin(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const res = await fetch(
      "https://www.kucoin.com/_api/cms/articles?page=1&pageSize=10&category=listing&lang=en_US",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return events;
    const data = await res.json();
    const items = data?.items || data?.data?.items || [];
    for (const item of items) {
      const title = (item.title || "").toUpperCase();
      if (!title.includes("LIST") && !title.includes("DELIST")) continue;
      const symbolMatch = title.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : "UNKNOWN";
      const eventType = title.includes("DELIST") ? "delisting" : "listing";
      const hash = await dedupHash(symbol, "kucoin", eventType);
      events.push({
        token_symbol: symbol.toUpperCase().trim(),
        token_name: item.title,
        exchange: "kucoin",
        event_type: eventType,
        status: "announced",
        source_url: item.url || "https://www.kucoin.com/news",
        announcement_time: item.publishTime ? new Date(item.publishTime).toISOString() : undefined,
        detected_time: new Date().toISOString(),
        confidence_score: computeConfidence({ event_type: eventType }, true, false),
        lead_time_minutes: computeLeadTime(
          item.publishTime ? new Date(item.publishTime).toISOString() : undefined,
          new Date().toISOString()
        ),
        raw_payload: JSON.stringify(item).slice(0, 2000),
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("KuCoin adapter error:", err);
  }
  return events;
}

async function fetchOKX(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const res = await fetch(
      "https://www.okx.com/v2/support/home/web?page=1&pageSize=10&t=" + Date.now(),
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return events;
    const data = await res.json();
    const articles = data?.data?.notices || [];
    for (const a of articles) {
      const title = (a.title || "").toUpperCase();
      if (!title.includes("LIST") && !title.includes("DELIST") && !title.includes("PERPETUAL")) continue;
      const symbolMatch = title.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : "UNKNOWN";
      let eventType = "listing";
      if (title.includes("DELIST")) eventType = "delisting";
      else if (title.includes("PERPETUAL")) eventType = "perpetual_listing";
      const hash = await dedupHash(symbol, "okx", eventType);
      events.push({
        token_symbol: symbol.toUpperCase().trim(),
        token_name: a.title,
        exchange: "okx",
        event_type: eventType,
        status: "announced",
        source_url: a.url || "https://www.okx.com/support/hc",
        detected_time: new Date().toISOString(),
        confidence_score: computeConfidence({ event_type: eventType }, true, false),
        raw_payload: JSON.stringify(a).slice(0, 2000),
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("OKX adapter error:", err);
  }
  return events;
}

async function fetchBybit(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=10",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return events;
    const data = await res.json();
    const items = data?.result?.list || [];
    for (const item of items) {
      const title = (item.title || "").toUpperCase();
      const symbolMatch = title.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : "UNKNOWN";
      let eventType = "listing";
      if (title.includes("DELIST")) eventType = "delisting";
      else if (title.includes("FUTURES") || title.includes("PERPETUAL")) eventType = "futures_listing";
      const hash = await dedupHash(symbol, "bybit", eventType);
      events.push({
        token_symbol: symbol.toUpperCase().trim(),
        token_name: item.title,
        exchange: "bybit",
        event_type: eventType,
        status: "announced",
        source_url: item.url || `https://announcements.bybit.com/article/${item.slug || ""}`,
        announcement_time: item.dateTimestamp ? new Date(item.dateTimestamp * 1000).toISOString() : undefined,
        detected_time: new Date().toISOString(),
        confidence_score: computeConfidence({ event_type: eventType }, true, false),
        lead_time_minutes: computeLeadTime(
          item.dateTimestamp ? new Date(item.dateTimestamp * 1000).toISOString() : undefined,
          new Date().toISOString()
        ),
        raw_payload: JSON.stringify(item).slice(0, 2000),
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("Bybit adapter error:", err);
  }
  return events;
}

async function fetchCoinbase(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const res = await fetch(
      "https://www.coinbase.com/api/v2/assets/search?base=USD&filter=listed&include_prices=false&limit=20&order=date&page=1&resolution=day&sort=created_at",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return events;
    const data = await res.json();
    const assets = data?.data || [];
    for (const a of assets) {
      const symbol = (a.symbol || a.base || "").toUpperCase().trim();
      if (!symbol || symbol.length < 2) continue;
      const hash = await dedupHash(symbol, "coinbase", "listing");
      events.push({
        token_symbol: symbol,
        token_name: a.name || symbol,
        exchange: "coinbase",
        event_type: "listing",
        status: "live",
        source_url: "https://www.coinbase.com/blog",
        detected_time: new Date().toISOString(),
        confidence_score: 85,
        dedup_hash: hash,
      });
    }
  } catch (err) {
    console.error("Coinbase adapter error:", err);
  }
  return events;
}

// ── MAIN HANDLER ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Run all adapters in parallel
    const [binance, coingecko, kucoin, okx, bybit, coinbase] = await Promise.allSettled([
      fetchBinance(),
      fetchCoinGeckoNewCoins(),
      fetchKuCoin(),
      fetchOKX(),
      fetchBybit(),
      fetchCoinbase(),
    ]);

    const allEvents: NormalizedEvent[] = [];
    for (const result of [binance, coingecko, kucoin, okx, bybit, coinbase]) {
      if (result.status === "fulfilled") allEvents.push(...result.value);
    }

    console.log(`[opportunity-ingest] Collected ${allEvents.length} raw events`);

    // Upsert with dedup (unique index on dedup_hash handles conflicts)
    let inserted = 0;
    let skipped = 0;
    for (const event of allEvents) {
      if (event.token_symbol === "UNKNOWN") { skipped++; continue; }
      const { error } = await sb.from("listing_events").upsert(
        {
          token_symbol: event.token_symbol,
          token_name: event.token_name,
          contract_address: event.contract_address,
          chain: event.chain,
          exchange: event.exchange,
          pair: event.pair,
          event_type: event.event_type,
          status: event.status,
          source_url: event.source_url,
          announcement_time: event.announcement_time,
          detected_time: event.detected_time,
          confidence_score: event.confidence_score,
          lead_time_minutes: event.lead_time_minutes,
          raw_payload: event.raw_payload,
          dedup_hash: event.dedup_hash,
        },
        { onConflict: "dedup_hash", ignoreDuplicates: true }
      );
      if (error) { skipped++; } else { inserted++; }
    }

    console.log(`[opportunity-ingest] Inserted ${inserted}, skipped ${skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        total: allEvents.length,
        inserted,
        skipped,
        sources: {
          binance: binance.status === "fulfilled" ? binance.value.length : 0,
          coingecko: coingecko.status === "fulfilled" ? coingecko.value.length : 0,
          kucoin: kucoin.status === "fulfilled" ? kucoin.value.length : 0,
          okx: okx.status === "fulfilled" ? okx.value.length : 0,
          bybit: bybit.status === "fulfilled" ? bybit.value.length : 0,
          coinbase: coinbase.status === "fulfilled" ? coinbase.value.length : 0,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[opportunity-ingest] Fatal:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
