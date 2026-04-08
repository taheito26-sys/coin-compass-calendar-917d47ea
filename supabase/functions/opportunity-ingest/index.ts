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

// ── Airdrop project type ────────────────────────────────────────────
interface DiscoveredAirdrop {
  project_name: string;
  token_symbol: string | null;
  chain: string | null;
  confidence_score: number;
  eligibility_requirements: string | null;
  official_url: string | null;
  snapshot_date: string | null;
  distribution_date: string | null;
  tasks: { task_type: string; description: string; required: boolean }[];
}

// ── AIRDROP ADAPTER: Binance Launchpad/Megadrop ─────────────────────
async function discoverBinanceAirdrops(): Promise<DiscoveredAirdrop[]> {
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=20",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const data = await res.json();
    const articles = data?.data?.catalogs?.[0]?.articles ?? data?.data?.articles ?? [];

    for (const a of articles) {
      const title = (a.title || "");
      const upper = title.toUpperCase();
      if (!upper.includes("LAUNCHPOOL") && !upper.includes("MEGADROP") && !upper.includes("AIRDROP") && !upper.includes("HODLer")) continue;

      const symbolMatch = upper.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : null;

      let programType = "Launchpool";
      if (upper.includes("MEGADROP")) programType = "Megadrop";
      else if (upper.includes("HODLER")) programType = "HODLer Airdrop";

      airdrops.push({
        project_name: `Binance ${programType} - ${symbol || title.slice(0, 30)}`,
        token_symbol: symbol,
        chain: "BNB Chain",
        confidence_score: 90,
        eligibility_requirements: `Participate in Binance ${programType}`,
        official_url: `https://www.binance.com/en/support/announcement/${a.code || ""}`,
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "staking", description: `Stake BNB or FDUSD in Binance ${programType}`, required: true },
          { task_type: "kyc", description: "Complete KYC verification on Binance", required: true },
          ...(programType === "Megadrop" ? [{ task_type: "quest", description: "Complete Web3 quests in Megadrop portal", required: true }] : []),
        ],
      });
    }
  } catch (err) {
    console.error("Binance airdrop discovery error:", err);
  }
  return airdrops;
}

// ── AIRDROP ADAPTER: Bybit Launchpool ───────────────────────────────
async function discoverBybitAirdrops(): Promise<DiscoveredAirdrop[]> {
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=20",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const data = await res.json();
    const items = data?.result?.list || [];

    for (const item of items) {
      const title = (item.title || "");
      const upper = title.toUpperCase();
      if (!upper.includes("LAUNCHPOOL") && !upper.includes("AIRDROP") && !upper.includes("TOKEN DISTRIBUTION")) continue;

      const symbolMatch = upper.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : null;

      airdrops.push({
        project_name: `Bybit Launchpool - ${symbol || title.slice(0, 30)}`,
        token_symbol: symbol,
        chain: "Multi-chain",
        confidence_score: 78,
        eligibility_requirements: "Stake USDT or MNT in Bybit Launchpool",
        official_url: item.url || "https://www.bybit.com/en/launchpool",
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "staking", description: "Stake USDT or MNT in active Launchpool", required: true },
          { task_type: "kyc", description: "Complete identity verification on Bybit", required: true },
        ],
      });
    }
  } catch (err) {
    console.error("Bybit airdrop discovery error:", err);
  }
  return airdrops;
}

// ── AIRDROP ADAPTER: KuCoin Spotlight/Burningdrop ───────────────────
async function discoverKuCoinAirdrops(): Promise<DiscoveredAirdrop[]> {
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://www.kucoin.com/_api/cms/articles?page=1&pageSize=10&category=listing&lang=en_US",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const data = await res.json();
    const items = data?.items || data?.data?.items || [];

    for (const item of items) {
      const title = (item.title || "");
      const upper = title.toUpperCase();
      if (!upper.includes("SPOTLIGHT") && !upper.includes("BURNINGDROP") && !upper.includes("AIRDROP")) continue;

      const symbolMatch = upper.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : null;

      let programType = "Spotlight";
      if (upper.includes("BURNINGDROP")) programType = "BurningDrop";

      airdrops.push({
        project_name: `KuCoin ${programType} - ${symbol || title.slice(0, 30)}`,
        token_symbol: symbol,
        chain: "Multi-chain",
        confidence_score: 72,
        eligibility_requirements: `Hold KCS and participate in KuCoin ${programType}`,
        official_url: item.url || "https://www.kucoin.com/spotlight",
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "staking", description: `Hold KCS tokens for ${programType} eligibility`, required: true },
          { task_type: "kyc", description: "Complete KYC on KuCoin", required: true },
        ],
      });
    }
  } catch (err) {
    console.error("KuCoin airdrop discovery error:", err);
  }
  return airdrops;
}

// ── AIRDROP ADAPTER: OKX Jumpstart ──────────────────────────────────
async function discoverOKXAirdrops(): Promise<DiscoveredAirdrop[]> {
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://www.okx.com/v2/support/home/web?page=1&pageSize=10&t=" + Date.now(),
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const data = await res.json();
    const articles = data?.data?.notices || [];

    for (const a of articles) {
      const title = (a.title || "");
      const upper = title.toUpperCase();
      if (!upper.includes("JUMPSTART") && !upper.includes("AIRDROP")) continue;

      const symbolMatch = upper.match(/\(([A-Z0-9]{2,10})\)/);
      const symbol = symbolMatch ? symbolMatch[1] : null;

      airdrops.push({
        project_name: `OKX Jumpstart - ${symbol || title.slice(0, 30)}`,
        token_symbol: symbol,
        chain: "Multi-chain",
        confidence_score: 80,
        eligibility_requirements: "Hold OKB tokens, participate in Jumpstart",
        official_url: a.url || "https://www.okx.com/jumpstart",
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "staking", description: "Hold minimum OKB balance for Jumpstart eligibility", required: true },
          { task_type: "kyc", description: "Complete KYC on OKX", required: true },
        ],
      });
    }
  } catch (err) {
    console.error("OKX airdrop discovery error:", err);
  }
  return airdrops;
}

// ── AIRDROP ADAPTER: Gate.io Startup ────────────────────────────────
async function discoverGateAirdrops(): Promise<DiscoveredAirdrop[]> {
  // Gate.io doesn't have a clean public API for startup, we derive from listing events
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://www.gate.io/api/v4/spot/currencies",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const currencies = await res.json();
    // Take recent additions (last 5)
    const recent = Array.isArray(currencies) ? currencies.slice(-5) : [];
    for (const c of recent) {
      if (c.trade_disabled) continue;
      const symbol = (c.currency || "").toUpperCase();
      if (!symbol || symbol.length < 2) continue;
      airdrops.push({
        project_name: `Gate.io Startup - ${symbol}`,
        token_symbol: symbol,
        chain: c.chain || "Multi-chain",
        confidence_score: 65,
        eligibility_requirements: "Hold GT tokens, participate in Gate.io Startup",
        official_url: "https://www.gate.io/startup",
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "staking", description: "Hold GT tokens for Startup participation rights", required: true },
          { task_type: "kyc", description: "Complete KYC on Gate.io", required: true },
        ],
      });
    }
  } catch (err) {
    console.error("Gate.io airdrop discovery error:", err);
  }
  return airdrops;
}

// ── AIRDROP ADAPTER: CoinGecko trending (potential airdrops) ────────
async function discoverCoinGeckoAirdrops(): Promise<DiscoveredAirdrop[]> {
  const airdrops: DiscoveredAirdrop[] = [];
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/search/trending",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return airdrops;
    const data = await res.json();
    const coins = data?.coins || [];

    for (const entry of coins) {
      const coin = entry.item;
      if (!coin) continue;
      const symbol = (coin.symbol || "").toUpperCase();
      const name = coin.name || symbol;
      // Only consider coins with high market cap rank as potential airdrop-worthy
      if (coin.market_cap_rank && coin.market_cap_rank > 500) continue;

      airdrops.push({
        project_name: `${name} Ecosystem`,
        token_symbol: symbol,
        chain: coin.platforms ? Object.keys(coin.platforms)[0] || "Multi-chain" : "Multi-chain",
        confidence_score: 45,
        eligibility_requirements: `Use ${name} ecosystem dApps, provide liquidity, participate in governance`,
        official_url: `https://www.coingecko.com/en/coins/${coin.id}`,
        snapshot_date: null,
        distribution_date: null,
        tasks: [
          { task_type: "defi", description: `Use ${name} ecosystem applications`, required: true },
          { task_type: "social", description: `Follow ${name} on social media and join community`, required: false },
        ],
      });
    }
  } catch (err) {
    console.error("CoinGecko airdrop discovery error:", err);
  }
  return airdrops;
}

// ── Upsert discovered airdrops ──────────────────────────────────────
async function upsertAirdrops(sb: ReturnType<typeof createClient>, discovered: DiscoveredAirdrop[]) {
  let inserted = 0;
  let skipped = 0;

  for (const airdrop of discovered) {
    // Check if project already exists by name
    const { data: existing } = await sb
      .from("airdrop_projects")
      .select("id")
      .eq("project_name", airdrop.project_name)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // Insert project
    const { data: project, error: projErr } = await sb
      .from("airdrop_projects")
      .insert({
        project_name: airdrop.project_name,
        token_symbol: airdrop.token_symbol,
        chain: airdrop.chain,
        confidence_score: airdrop.confidence_score,
        eligibility_requirements: airdrop.eligibility_requirements,
        official_url: airdrop.official_url,
        snapshot_date: airdrop.snapshot_date,
        distribution_date: airdrop.distribution_date,
      })
      .select("id")
      .single();

    if (projErr || !project) { skipped++; continue; }

    // Insert tasks
    if (airdrop.tasks.length > 0) {
      await sb.from("airdrop_tasks").insert(
        airdrop.tasks.map(t => ({
          project_id: project.id,
          task_type: t.task_type,
          description: t.description,
          required: t.required,
        }))
      );
    }

    inserted++;
  }

  return { inserted, skipped };
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

    // Run all adapters in parallel (listings + airdrops)
    const [binance, coingecko, kucoin, okx, bybit, coinbase,
           airdropBinance, airdropBybit, airdropKuCoin, airdropOKX, airdropGate, airdropCoinGecko] =
      await Promise.allSettled([
        fetchBinance(),
        fetchCoinGeckoNewCoins(),
        fetchKuCoin(),
        fetchOKX(),
        fetchBybit(),
        fetchCoinbase(),
        discoverBinanceAirdrops(),
        discoverBybitAirdrops(),
        discoverKuCoinAirdrops(),
        discoverOKXAirdrops(),
        discoverGateAirdrops(),
        discoverCoinGeckoAirdrops(),
      ]);

    // ── Process listing events ───────────────────────────────────
    const allEvents: NormalizedEvent[] = [];
    for (const result of [binance, coingecko, kucoin, okx, bybit, coinbase]) {
      if (result.status === "fulfilled") allEvents.push(...result.value);
    }

    console.log(`[opportunity-ingest] Collected ${allEvents.length} raw events`);

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

    console.log(`[opportunity-ingest] Listing events: inserted ${inserted}, skipped ${skipped}`);

    // ── Process airdrop discoveries ──────────────────────────────
    const allAirdrops: DiscoveredAirdrop[] = [];
    for (const result of [airdropBinance, airdropBybit, airdropKuCoin, airdropOKX, airdropGate, airdropCoinGecko]) {
      if (result.status === "fulfilled") allAirdrops.push(...result.value);
    }

    console.log(`[opportunity-ingest] Discovered ${allAirdrops.length} potential airdrops`);

    const airdropResult = await upsertAirdrops(sb, allAirdrops);
    console.log(`[opportunity-ingest] Airdrops: inserted ${airdropResult.inserted}, skipped ${airdropResult.skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        listings: { total: allEvents.length, inserted, skipped },
        airdrops: { discovered: allAirdrops.length, ...airdropResult },
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
