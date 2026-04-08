import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WhaleAlert {
  id: string;
  blockchain: string;
  symbol: string;
  amount: number;
  amount_usd: number;
  from: string;
  to: string;
  timestamp: number;
  transaction_type: string;
  tx_hash: string;
}

// Chain configs: [blockchainName, symbol, satoshiDivisor]
const CHAINS: [string, string, number][] = [
  ["ethereum", "ETH", 1e18],
  ["bitcoin", "BTC", 1e8],
  ["litecoin", "LTC", 1e8],
  ["dogecoin", "DOGE", 1e8],
  ["bitcoin-cash", "BCH", 1e8],
  ["dash", "DASH", 1e8],
  ["zcash", "ZEC", 1e8],
  ["bitcoin-sv", "BSV", 1e8],
  ["groestlcoin", "GRS", 1e8],
];

// Approximate USD prices fetched once per invocation
async function fetchPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,litecoin,dogecoin,bitcoin-cash,solana,cardano,polkadot,avalanche-2,chainlink,uniswap,matic-network,dash,zcash,bitcoin-cash-sv,groestlcoin,ripple,stellar,tron,cosmos,near,fantom,algorand&vs_currencies=usd",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return {
      BTC: data.bitcoin?.usd ?? 0,
      ETH: data.ethereum?.usd ?? 0,
      LTC: data.litecoin?.usd ?? 0,
      DOGE: data.dogecoin?.usd ?? 0,
      BCH: data["bitcoin-cash"]?.usd ?? 0,
      SOL: data.solana?.usd ?? 0,
      ADA: data.cardano?.usd ?? 0,
      DOT: data.polkadot?.usd ?? 0,
      AVAX: data["avalanche-2"]?.usd ?? 0,
      LINK: data.chainlink?.usd ?? 0,
      UNI: data.uniswap?.usd ?? 0,
      MATIC: data["matic-network"]?.usd ?? 0,
      DASH: data.dash?.usd ?? 0,
      ZEC: data.zcash?.usd ?? 0,
      BSV: data["bitcoin-cash-sv"]?.usd ?? 0,
      GRS: data.groestlcoin?.usd ?? 0,
      XRP: data.ripple?.usd ?? 0,
      XLM: data.stellar?.usd ?? 0,
      TRX: data.tron?.usd ?? 0,
      ATOM: data.cosmos?.usd ?? 0,
      NEAR: data.near?.usd ?? 0,
      FTM: data.fantom?.usd ?? 0,
      ALGO: data.algorand?.usd ?? 0,
    };
  } catch (e) {
    console.error("Price fetch failed:", e);
    try {
      const r = await fetch("https://mempool.space/api/v1/prices", { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      return { BTC: d.USD ?? 0 };
    } catch {
      return {};
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MempoolTx { txid: string; value: number; }

async function fetchBtcWhales(btcPrice: number): Promise<WhaleAlert[]> {
  try {
    const res = await fetch("https://mempool.space/api/mempool/recent", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const txs = (await res.json()) as MempoolTx[];
    return txs
      .filter((tx) => tx.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4)
      .map((tx) => {
        const amount = tx.value / 1e8;
        return {
          id: `btc-${tx.txid.slice(0, 12)}`,
          blockchain: "bitcoin",
          symbol: "BTC",
          amount,
          amount_usd: amount * btcPrice,
          from: "Bitcoin mempool",
          to: "Pending outputs",
          timestamp: Date.now(),
          transaction_type: "transfer",
          tx_hash: tx.txid,
        };
      });
  } catch (e) {
    console.error("BTC fetch error:", e);
    return [];
  }
}

interface BlockchairTx {
  hash: string;
  input_total?: number;
  input_total_usd?: number;
  value?: number;
  value_usd?: number;
  sender?: string;
  recipient?: string;
}

async function fetchBlockchairChain(chain: string, symbol: string, divisor: number, price: number): Promise<WhaleAlert[]> {
  try {
    // Use Blockchair's free mempool endpoint for UTXO chains, transactions for account chains
    const endpoint = chain === "ethereum"
      ? `https://api.blockchair.com/${chain}/mempool/transactions?limit=10&s=value(desc)`
      : `https://api.blockchair.com/${chain}/mempool/transactions?limit=10&s=input_total(desc)`;
    
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.log(`Blockchair ${chain}: ${res.status}`);
      return [];
    }
    const json = await res.json();
    const txs: BlockchairTx[] = json?.data ?? [];
    
    return txs.slice(0, 3).map((tx) => {
      const rawVal = chain === "ethereum" ? (tx.value ?? 0) : (tx.input_total ?? 0);
      const amount = rawVal / divisor;
      const usdVal = chain === "ethereum" ? (tx.value_usd ?? amount * price) : (tx.input_total_usd ?? amount * price);
      return {
        id: `${symbol.toLowerCase()}-${(tx.hash ?? "").slice(0, 12)}`,
        blockchain: chain,
        symbol,
        amount,
        amount_usd: usdVal,
        from: tx.sender ?? `${chain} mempool`,
        to: tx.recipient ?? "Pending",
        timestamp: Date.now(),
        transaction_type: "transfer",
        tx_hash: tx.hash ?? "",
      };
    });
  } catch (e) {
    console.error(`Blockchair ${chain} error:`, e);
    return [];
  }
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function cacheAlerts(alerts: WhaleAlert[]) {
  if (alerts.length === 0) return;
  const sb = getSupabaseAdmin();
  
  // Delete old entries (> 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await sb.from("whale_cache").delete().lt("detected_at", cutoff);
  
  // Insert new ones
  const rows = alerts.map((a) => ({
    blockchain: a.blockchain,
    symbol: a.symbol,
    amount: a.amount,
    amount_usd: a.amount_usd,
    from_address: a.from,
    to_address: a.to,
    tx_hash: a.tx_hash,
    transaction_type: a.transaction_type,
    detected_at: new Date(a.timestamp).toISOString(),
  }));
  
  const { error } = await sb.from("whale_cache").insert(rows);
  if (error) console.error("Cache insert error:", error.message);
}

async function getCachedAlerts(): Promise<WhaleAlert[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("whale_cache")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(15);
  
  if (error || !data || data.length === 0) return [];
  
  return data.map((row: Record<string, unknown>) => ({
    id: `cached-${(row.id as string).slice(0, 8)}`,
    blockchain: row.blockchain as string,
    symbol: row.symbol as string,
    amount: Number(row.amount),
    amount_usd: Number(row.amount_usd),
    from: row.from_address as string,
    to: row.to_address as string,
    timestamp: new Date(row.detected_at as string).getTime(),
    transaction_type: row.transaction_type as string,
    tx_hash: (row.tx_hash as string) ?? "",
  }));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const prices = await fetchPrices();
    const allAlerts: WhaleAlert[] = [];

    // Fetch BTC from mempool.space (most reliable)
    const btcAlerts = await fetchBtcWhales(prices.BTC);
    allAlerts.push(...btcAlerts);

    // Fetch altcoins from Blockchair with delays to respect rate limits
    const altChains: [string, string, number][] = [
      ["ethereum", "ETH", 1e18],
      ["litecoin", "LTC", 1e8],
      ["dogecoin", "DOGE", 1e8],
      ["bitcoin-cash", "BCH", 1e8],
      ["dash", "DASH", 1e8],
      ["zcash", "ZEC", 1e8],
      ["bitcoin-sv", "BSV", 1e8],
      ["groestlcoin", "GRS", 1e8],
    ];

    for (const [chain, sym, div] of altChains) {
      await sleep(500);
      const chainAlerts = await fetchBlockchairChain(chain, sym, div, prices[sym] ?? 0);
      allAlerts.push(...chainAlerts);
    }

    // Sort by USD value descending, take top 12
    allAlerts.sort((a, b) => b.amount_usd - a.amount_usd);
    const topAlerts = allAlerts.slice(0, 12);

    if (topAlerts.length > 0) {
      // Cache in background (don't block response)
      cacheAlerts(topAlerts).catch((e) => console.error("Cache error:", e));

      return new Response(
        JSON.stringify({ success: true, source: "live", alerts: topAlerts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If live fetch returned nothing, try cache
    console.log("No live alerts, falling back to cache");
    const cached = await getCachedAlerts();
    return new Response(
      JSON.stringify({ success: true, source: cached.length > 0 ? "cached" : "empty", alerts: cached }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("whale-feed error:", error);
    
    // On any error, try to serve cached data
    try {
      const cached = await getCachedAlerts();
      if (cached.length > 0) {
        return new Response(
          JSON.stringify({ success: true, source: "cached", alerts: cached }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (cacheErr) {
      console.error("Cache fallback also failed:", cacheErr);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message, alerts: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
