const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MempoolTx {
  txid: string;
  value: number;
}

interface PriceResponse {
  USD?: number;
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const [txRes, priceRes] = await Promise.all([
      fetch("https://mempool.space/api/mempool/recent"),
      fetch("https://mempool.space/api/v1/prices"),
    ]);

    if (!txRes.ok) {
      throw new Error(`mempool recent failed: ${txRes.status}`);
    }

    if (!priceRes.ok) {
      throw new Error(`mempool price failed: ${priceRes.status}`);
    }

    const txs = (await txRes.json()) as MempoolTx[];
    const prices = (await priceRes.json()) as PriceResponse;
    const btcUsd = Number(prices.USD ?? 0);

    const alerts: WhaleAlert[] = txs
      .filter((tx) => Number(tx.value) > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((tx) => {
        const amount = Number(tx.value) / 1e8;
        return {
          id: `btc-${tx.txid}`,
          blockchain: "bitcoin",
          symbol: "BTC",
          amount,
          amount_usd: amount * btcUsd,
          from: "Bitcoin mempool",
          to: "Pending outputs",
          timestamp: Date.now(),
          transaction_type: "transfer",
          tx_hash: tx.txid,
        };
      });

    return new Response(JSON.stringify({ success: true, alerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("whale-feed error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message, alerts: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
