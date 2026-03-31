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

// Blockchair chains config: [apiPath, symbol, divisor]
const CHAINS: [string, string, number][] = [
  ["bitcoin", "BTC", 1e8],
  ["ethereum", "ETH", 1e18],
  ["litecoin", "LTC", 1e8],
  ["dogecoin", "DOGE", 1e8],
  ["bitcoin-cash", "BCH", 1e8],
];

async function fetchChain(
  chain: string,
  symbol: string,
  divisor: number
): Promise<WhaleAlert[]> {
  // For UTXO chains (BTC, LTC, DOGE, BCH) use output_total_usd
  // For account chains (ETH) use value_usd
  const isUtxo = chain !== "ethereum";

  const valueField = isUtxo ? "output_total_usd" : "value_usd";
  const amountField = isUtxo ? "output_total" : "value";

  const url = `https://api.blockchair.com/${chain}/transactions?s=${valueField}(desc)&limit=5&q=${valueField}(1000000..)`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Blockchair ${chain} error: ${res.status}`);
    const body = await res.text();
    console.error(body);
    return [];
  }

  const json = await res.json();
  const txs: Record<string, unknown>[] = json?.data ?? [];

  return txs.map((tx: Record<string, unknown>) => {
    const rawAmount = Number(tx[amountField] ?? 0);
    const amount = isUtxo ? rawAmount / divisor : rawAmount / divisor;
    const amountUsd = Number(tx[valueField] ?? 0);
    const hash = String(tx.hash ?? "");
    const time = String(tx.time ?? "");

    return {
      id: `${symbol.toLowerCase()}-${hash}`,
      blockchain: chain,
      symbol,
      amount,
      amount_usd: amountUsd,
      from: isUtxo ? "Multiple Inputs" : String((tx as any).sender ?? "Unknown"),
      to: isUtxo ? "Multiple Outputs" : String((tx as any).recipient ?? "Unknown"),
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
    // Fetch all chains in parallel
    const results = await Promise.allSettled(
      CHAINS.map(([chain, sym, div]) => fetchChain(chain, sym, div))
    );

    const alerts: WhaleAlert[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        alerts.push(...r.value);
      }
    }

    // Sort by USD value descending, take top 10
    alerts.sort((a, b) => b.amount_usd - a.amount_usd);

    return new Response(
      JSON.stringify({ success: true, alerts: alerts.slice(0, 10) }),
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
