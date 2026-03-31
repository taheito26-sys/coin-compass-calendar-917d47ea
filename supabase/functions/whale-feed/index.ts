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

// Blockchair chains: [apiPath, symbol, divisor]
const CHAINS: [string, string, number][] = [
  ["bitcoin", "BTC", 1e8],
  ["ethereum", "ETH", 1e18],
  ["litecoin", "LTC", 1e8],
  ["dogecoin", "DOGE", 1e8],
  ["bitcoin-cash", "BCH", 1e8],
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchChain(
  chain: string,
  symbol: string,
  divisor: number
): Promise<WhaleAlert[]> {
  const isUtxo = chain !== "ethereum";
  const valueField = isUtxo ? "output_total_usd" : "value_usd";
  const amountField = isUtxo ? "output_total" : "value";

  // Last 24h, >$1M
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const url = `https://api.blockchair.com/${chain}/transactions?s=${valueField}(desc)&limit=3&q=${valueField}(1000000..),time(${yesterday}..)`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error(`Blockchair ${chain} ${res.status}: ${body.slice(0, 200)}`);
    return [];
  }

  const json = await res.json();
  const txs: Record<string, unknown>[] = json?.data ?? [];

  return txs.map((tx: Record<string, unknown>) => {
    const rawAmount = Number(tx[amountField] ?? 0);
    const amount = rawAmount / divisor;
    const amountUsd = Number(tx[valueField] ?? 0);
    const hash = String(tx.hash ?? "");
    const time = String(tx.time ?? "");

    return {
      id: `${symbol.toLowerCase()}-${hash}`,
      blockchain: chain,
      symbol,
      amount,
      amount_usd: amountUsd,
      from: isUtxo ? "Multiple Inputs" : String((tx as Record<string, unknown>).sender ?? "Unknown"),
      to: isUtxo ? "Multiple Outputs" : String((tx as Record<string, unknown>).recipient ?? "Unknown"),
      timestamp: new Date(time + (time.includes("Z") ? "" : "Z")).getTime(),
      transaction_type: "transfer",
      tx_hash: hash,
    };
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const alerts: WhaleAlert[] = [];

    // Fetch sequentially with small delay to avoid Blockchair free-tier rate limits
    for (const [chain, sym, div] of CHAINS) {
      try {
        const result = await fetchChain(chain, sym, div);
        alerts.push(...result);
      } catch (e) {
        console.error(`Error fetching ${chain}:`, e);
      }
      // 500ms delay between chains to respect free rate limit
      await sleep(500);
    }

    alerts.sort((a, b) => b.amount_usd - a.amount_usd);

    return new Response(
      JSON.stringify({ success: true, alerts: alerts.slice(0, 12) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("whale-feed error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg, alerts: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
