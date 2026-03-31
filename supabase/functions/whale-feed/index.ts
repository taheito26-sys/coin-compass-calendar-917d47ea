const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BlockchairTx {
  block_id: number;
  hash: string;
  time: string;
  input_total: number;
  output_total: number;
  input_total_usd: number;
  output_total_usd: number;
}

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch large BTC transactions from Blockchair (free, no key)
    const btcUrl =
      "https://api.blockchair.com/bitcoin/transactions?s=output_total_usd(desc)&limit=5&q=output_total_usd(1000000..)";
    const ethUrl =
      "https://api.blockchair.com/ethereum/transactions?s=value_usd(desc)&limit=5&q=value_usd(1000000..)";

    const [btcRes, ethRes] = await Promise.allSettled([
      fetch(btcUrl),
      fetch(ethUrl),
    ]);

    const alerts: WhaleAlert[] = [];

    // Parse BTC
    if (btcRes.status === "fulfilled" && btcRes.value.ok) {
      const btcData = await btcRes.value.json();
      const txs: BlockchairTx[] = btcData?.data ?? [];
      for (const tx of txs) {
        const amountBtc = (tx.output_total ?? 0) / 1e8;
        alerts.push({
          id: `btc-${tx.hash}`,
          blockchain: "bitcoin",
          symbol: "BTC",
          amount: amountBtc,
          amount_usd: tx.output_total_usd ?? 0,
          from: "Unknown",
          to: "Unknown",
          timestamp: new Date(tx.time + "Z").getTime(),
          transaction_type: "transfer",
          tx_hash: tx.hash,
        });
      }
    }

    // Parse ETH
    if (ethRes.status === "fulfilled" && ethRes.value.ok) {
      const ethData = await ethRes.value.json();
      const txs = ethData?.data ?? [];
      for (const tx of txs) {
        const amountEth = (tx.value ?? 0) / 1e18;
        alerts.push({
          id: `eth-${tx.hash}`,
          blockchain: "ethereum",
          symbol: "ETH",
          amount: amountEth,
          amount_usd: tx.value_usd ?? 0,
          from: tx.sender ?? "Unknown",
          to: tx.recipient ?? "Unknown",
          timestamp: new Date(tx.time + "Z").getTime(),
          transaction_type: "transfer",
          tx_hash: tx.hash,
        });
      }
    }

    // Sort by USD value descending
    alerts.sort((a, b) => b.amount_usd - a.amount_usd);

    return new Response(
      JSON.stringify({ success: true, alerts: alerts.slice(0, 8) }),
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
