import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    // Path: /exchange-sync, /exchange-sync/test/:exchange, /exchange-sync/sync/:exchange, /exchange-sync/:exchange
    const action = pathParts[1]; // test, sync, or exchange id for DELETE
    const exchangeId = pathParts[2] || action;

    // GET — list connections
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("exchange_connections")
        .select("id, exchange, label, status, last_sync, sync_count")
        .eq("user_id", user.id);

      if (error) return json({ error: error.message }, 500);
      return json({ connections: data || [] });
    }

    // POST — save new connection
    if (req.method === "POST" && (!action || action === "exchange-sync")) {
      const body = await req.json();
      const { exchange, api_key, api_secret, passphrase } = body;

      if (!exchange || !api_key || !api_secret) {
        return json({ error: "Missing required fields" }, 400);
      }

      const { error } = await supabase.from("exchange_connections").upsert(
        {
          user_id: user.id,
          exchange,
          api_key,
          api_secret,
          passphrase: passphrase || null,
          status: "connected",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,exchange" }
      );

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // POST test/:exchange — test connection
    if (req.method === "POST" && action === "test") {
      const { data: conn } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("exchange", exchangeId)
        .single();

      if (!conn) return json({ error: "Connection not found" }, 404);

      try {
        const result = await testExchangeConnection(
          exchangeId,
          conn.api_key,
          conn.api_secret,
          conn.passphrase
        );
        return json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Test failed";
        return json({ ok: false, message }, 500);
      }
    }

    // POST sync/:exchange — sync trades
    if (req.method === "POST" && action === "sync") {
      const { data: conn } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("exchange", exchangeId)
        .single();

      if (!conn) return json({ error: "Connection not found" }, 404);

      try {
        const result = await syncExchangeTrades(
          supabase,
          user.id,
          exchangeId,
          conn.api_key,
          conn.api_secret,
          conn.passphrase
        );

        // Update sync metadata
        await supabase
          .from("exchange_connections")
          .update({
            last_sync: new Date().toISOString(),
            sync_count: (conn.sync_count || 0) + (result.synced || 0),
            status: "connected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id);

        return json(result);
      } catch (err: unknown) {
        await supabase
          .from("exchange_connections")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", conn.id);

        const message = err instanceof Error ? err.message : "Sync failed";
        return json({ ok: false, error: message }, 500);
      }
    }

    // DELETE — remove connection
    if (req.method === "DELETE") {
      const targetExchange = action;
      const { error } = await supabase
        .from("exchange_connections")
        .delete()
        .eq("user_id", user.id)
        .eq("exchange", targetExchange);

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ error: message }, 500);
  }
});

// ─── Exchange-specific API helpers ───────────────────────────────────────────

async function testExchangeConnection(
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<{ ok: boolean; message: string }> {
  switch (exchange) {
    case "binance": {
      const ts = Date.now();
      const query = `timestamp=${ts}`;
      const sig = await hmacSign(apiSecret, query);
      const res = await fetch(
        `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
        { headers: { "X-MBX-APIKEY": apiKey } }
      );
      if (res.ok) return { ok: true, message: "Binance connection verified ✓" };
      const err = await res.json().catch(() => ({}));
      return { ok: false, message: (err as any)?.msg || `HTTP ${res.status}` };
    }
    case "bybit": {
      const ts = Date.now();
      const recvWindow = "5000";
      const query = "accountType=UNIFIED";
      const payload = `${ts}${apiKey}${recvWindow}${query}`;
      const sig = await hmacSign(apiSecret, payload);
      const res = await fetch(
        `https://api.bybit.com/v5/account/wallet-balance?${query}`,
        {
          headers: {
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-SIGN": sig,
            "X-BAPI-TIMESTAMP": String(ts),
            "X-BAPI-RECV-WINDOW": recvWindow,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.retCode === 0) return { ok: true, message: "Bybit connection verified ✓" };
        return { ok: false, message: data.retMsg || "Unknown error" };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    }
    case "okx": {
      const ts = new Date().toISOString();
      const path = "/api/v5/account/balance";
      const preSign = `${ts}GET${path}`;
      const sig = await hmacSignBase64(apiSecret, preSign);
      const res = await fetch(`https://www.okx.com${path}`, {
        headers: {
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-SIGN": sig,
          "OK-ACCESS-TIMESTAMP": ts,
          "OK-ACCESS-PASSPHRASE": passphrase || "",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.code === "0") return { ok: true, message: "OKX connection verified ✓" };
        return { ok: false, message: data.msg || "Unknown error" };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    }
    case "gate": {
      const ts = Math.floor(Date.now() / 1000);
      const path = "/api/v4/spot/accounts";
      const hashedBody = await sha512("");
      const signStr = `GET\n${path}\n\n${hashedBody}\n${ts}`;
      const sig = await hmacSign512(apiSecret, signStr);
      const res = await fetch(`https://api.gateio.ws${path}`, {
        headers: { KEY: apiKey, SIGN: sig, Timestamp: String(ts) },
      });
      if (res.ok) return { ok: true, message: "Gate.io connection verified ✓" };
      return { ok: false, message: `HTTP ${res.status}` };
    }
    case "kraken": {
      const nonce = Date.now();
      const postData = `nonce=${nonce}`;
      const path = "/0/private/Balance";
      const message = await krakenSign(path, postData, nonce, apiSecret);
      const res = await fetch(`https://api.kraken.com${path}`, {
        method: "POST",
        headers: {
          "API-Key": apiKey,
          "API-Sign": message,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: postData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error?.length === 0) return { ok: true, message: "Kraken connection verified ✓" };
        return { ok: false, message: data.error?.join(", ") || "Unknown error" };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    }
    case "coinbase": {
      const ts = Math.floor(Date.now() / 1000);
      const path = "/v2/accounts";
      const preSign = `${ts}GET${path}`;
      const sig = await hmacSign(apiSecret, preSign);
      const res = await fetch(`https://api.coinbase.com${path}`, {
        headers: {
          "CB-ACCESS-KEY": apiKey,
          "CB-ACCESS-SIGN": sig,
          "CB-ACCESS-TIMESTAMP": String(ts),
          "CB-VERSION": "2024-01-01",
        },
      });
      if (res.ok) return { ok: true, message: "Coinbase connection verified ✓" };
      return { ok: false, message: `HTTP ${res.status}` };
    }
    default:
      return { ok: false, message: `Unsupported exchange: ${exchange}` };
  }
}

interface NormalizedTrade {
  id: string;
  orderId?: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  feeCurrency?: string;
  timestamp: string;
}

/**
 * Standardizes trade data from various exchange formats into a unified internal format
 * and applies compaction logic to merge fragmented fills into clean "Purchase Operations".
 */
async function syncExchangeTrades(
  supabase: any,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<{ ok: boolean; synced: number; skipped: number }> {
  let trades: NormalizedTrade[] = [];
  let transfers: NormalizedTrade[] = [];

  console.log(`[sync] Fetching trades and transfers from ${exchange}...`);

  // Get assets we already know about for this user to ensure we scan history even for moved/sold assets
  const { data: userAssets } = await supabase
    .from("transactions")
    .select("assets(symbol, binance_symbol)")
    .eq("user_id", userId)
    .eq("venue", exchange);
  
  const knownSymbols = new Set<string>();
  for (const row of userAssets || []) {
    const s = row.assets?.symbol || row.assets?.binance_symbol;
    if (s) knownSymbols.add(s.toUpperCase());
  }

  switch (exchange) {
    case "binance":
      trades = await fetchBinanceTrades(apiKey, apiSecret, Array.from(knownSymbols));
      transfers = await fetchBinanceTransfers(apiKey, apiSecret);
      break;
    case "bybit":
      trades = await fetchBybitTrades(apiKey, apiSecret);
      transfers = await fetchBybitTransfers(apiKey, apiSecret);
      break;
    case "okx":
      trades = await fetchOkxTrades(apiKey, apiSecret, passphrase);
      transfers = await fetchOkxTransfers(apiKey, apiSecret, passphrase);
      break;
    case "gate":
      trades = await fetchGateTrades(apiKey, apiSecret);
      break;
    case "kraken":
      trades = await fetchKrakenTrades(apiKey, apiSecret);
      break;
    case "coinbase":
      trades = await fetchCoinbaseTrades(apiKey, apiSecret);
      break;
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }

  // Combine trades and transfers
  const allHistory = [...trades, ...transfers];

  if (!allHistory.length) {
    console.log(`[sync] ${exchange}: No new trades or transfers found`);
    return { ok: true, synced: 0, skipped: 0 };
  }

  // Fetch user preference for minimum import value
  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("key, value")
    .eq("user_id", userId);
  
  const prefs: Record<string, string> = {};
  for (const row of prefRows || []) {
    prefs[row.key] = row.value;
  }
  const minValThreshold = parseFloat(prefs.minImportValue || "100");

  // --- Smart Trade Compaction Logic ---
  // 1. Sort by time
  const sorted = allHistory
    .map(t => ({ ...t, symbol: t.symbol.toUpperCase() }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const clusters: (NormalizedTrade & { _lastTs: number })[] = [];

  for (const t of sorted) {
    const tTime = new Date(t.timestamp).getTime();
    
    // Strategy: 
    // - If orderId matches exactly, it's definitely the same operation.
    // - Otherwise, fallback to a 15-minute sliding window (if same symbol/side).
    let existingIndex = -1;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      const isSameOp = t.orderId && c.orderId && t.orderId === c.orderId;
      const isClose = c.symbol === t.symbol && c.side === t.side && (tTime - c._lastTs) < 15 * 60 * 1000;
      if (isSameOp || isClose) {
        existingIndex = i;
        break;
      }
    }

    if (existingIndex !== -1) {
      const existing = clusters[existingIndex];
      const totalQty = existing.qty + t.qty;
      // Weighted average price (only if totalQty > 0 to avoid NaN)
      if (totalQty > 0) {
        existing.price = (existing.price * existing.qty + t.price * t.qty) / totalQty;
      }
      existing.qty = totalQty;
      existing.fee += t.fee;
      existing._lastTs = tTime; // Update sliding window
    } else {
      clusters.push({ ...t, _lastTs: tTime });
    }
  }

  let synced = 0;
  let skipped = 0;
  let dustSkipped = 0;

  for (const trade of clusters) {
    // Filter out "dust" trades based on user preference
    // NEW: Only filter for Buy/Sell. DO NOT filter transfers (deposits/withdrawals).
    const isTrade = trade.side === "buy" || trade.side === "sell";
    const totalValue = trade.qty * trade.price;
    
    if (isTrade && totalValue < minValThreshold) {
      dustSkipped++;
      skipped++;
      continue;
    }

    // Resolve or create asset
    const { data: existingAsset } = await supabase
      .from("assets")
      .select("id")
      .or(`symbol.eq.${trade.symbol},binance_symbol.eq.${trade.symbol}`)
      .limit(1)
      .single();

    let assetId: string;
    if (existingAsset) {
      assetId = existingAsset.id;
    } else {
      const { data: newAsset, error: insertErr } = await supabase
        .from("assets")
        .insert({ symbol: trade.symbol, name: trade.symbol })
        .select("id")
        .single();
      if (insertErr || !newAsset) continue;
      assetId = newAsset.id;
    }

    // Stable ID for clusters: use first fill ID or order ID
    const externalId = trade.orderId 
      ? `${exchange}_order_${trade.orderId}`
      : `${exchange}_cluster_${trade.id}`;

    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", externalId)
      .limit(1)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: userId,
      asset_id: assetId,
      type: trade.side,
      qty: trade.qty,
      unit_price: trade.price,
      fee_amount: trade.fee || 0,
      fee_currency: trade.feeCurrency || "USD",
      timestamp: trade.timestamp,
      source: `api_${exchange}`,
      venue: exchange,
      external_id: externalId,
    });

    if (!txErr) synced++;
    else skipped++;
  }

  if (dustSkipped > 0) {
    console.log(`[sync] Ignored ${dustSkipped} dust trades below ${minValThreshold} USD`);
  }

  return { ok: true, synced, skipped };
}

async function fetchBinanceTrades(
  apiKey: string, 
  apiSecret: string, 
  knownAssets: string[] = []
): Promise<NormalizedTrade[]> {
  // Get current balances
  const ts = Date.now();
  const query = `timestamp=${ts}`;
  const sig = await hmacSign(apiSecret, query);
  const accRes = await fetch(
    `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  if (!accRes.ok) throw new Error(`Binance account fetch failed: ${accRes.status}`);
  const account = await accRes.json();

  const currentAssets = (account.balances || [])
    .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b: any) => b.asset as string);

  // Merge current holdings with previously known assets and major coins
  const assetsToScan = Array.from(new Set([
    ...currentAssets, 
    ...knownAssets, 
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "TRX", "TONCOIN", "AVAX", "LINK", "DOT", "MATIC", "PEPE", "SHIB", "APT", "SUI", "NEAR", "FET", "RENDER", "AXS", "INJ", "TAO", "QNT"
  ]));

  const allTrades: NormalizedTrade[] = [];
  const quotes = ["USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "BTC", "ETH", "BNB", "USD", "EUR", "GBP"];

  // Max lookback window: 365 days
  const startTime = Date.now() - (365 * 24 * 60 * 60 * 1000);

  // Fetch dust conversions first
  const dustTrades = await fetchBinanceDustLog(apiKey, apiSecret, startTime);
  allTrades.push(...dustTrades);

  console.log(`[Binance] Deep scan for ${assetsToScan.length} assets...`);

  for (const asset of assetsToScan) {
    if (quotes.includes(asset)) continue;
    
    const possibleSymbols = quotes.map(q => `${asset}${q}`);
    
    for (const symbol of possibleSymbols) {
      const ts2 = Date.now();
      // limit=1000 is max per symbol. We use startTime to catch older history.
      const q = `symbol=${symbol}&limit=1000&startTime=${startTime}&timestamp=${ts2}`;
      const s = await hmacSign(apiSecret, q);
      const res = await fetch(
        `https://api.binance.com/api/v3/myTrades?${q}&signature=${s}`,
        { headers: { "X-MBX-APIKEY": apiKey } }
      );
      
      if (!res.ok) continue;
      const trades = await res.json();
      if (!Array.isArray(trades)) continue;

      for (const t of trades) {
        allTrades.push({
          id: String(t.id),
          orderId: String(t.orderId),
          symbol: asset.toUpperCase(),
          side: t.isBuyer ? "buy" : "sell",
          qty: parseFloat(t.qty || 0),
          price: parseFloat(t.price || 0),
          fee: parseFloat(t.commission || 0),
          feeCurrency: t.commissionAsset || "USDT",
          timestamp: new Date(t.time).toISOString(),
        });
      }
    }
  }
  return allTrades;
}

async function fetchBybitTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  const recvWindow = "5000";
  const now = Date.now();
  const maxHistory = 365 * 24 * 60 * 60 * 1000; // 365 days
  const windowSize = 7 * 24 * 60 * 60 * 1000; // 7 days per window (Bybit API limit)

  // Iterate through 7-day windows from oldest to newest
  let windowStart = now - maxHistory;

  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + windowSize, now);
    let cursor = "";
    let hasMore = true;

    console.log(`[Bybit] Window: ${new Date(windowStart).toISOString().slice(0,10)} → ${new Date(windowEnd).toISOString().slice(0,10)}`);

    while (hasMore) {
      const ts = Date.now();
      const params = `category=spot&limit=100&startTime=${windowStart}&endTime=${windowEnd}${cursor ? `&cursor=${cursor}` : ""}`;
      const payload = `${ts}${apiKey}${recvWindow}${params}`;
      const sig = await hmacSign(apiSecret, payload);

      const res = await fetch(
        `https://api.bybit.com/v5/execution/list?${params}`,
        {
          headers: {
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-SIGN": sig,
            "X-BAPI-TIMESTAMP": String(ts),
            "X-BAPI-RECV-WINDOW": recvWindow,
          },
        }
      );

      if (!res.ok) {
        const body = await res.text();
        console.error(`[Bybit] API error: ${res.status} — ${body}`);
        throw new Error(`Bybit trades failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.retCode !== 0) {
        console.error(`[Bybit] retCode=${data.retCode}: ${data.retMsg}`);
        throw new Error(data.retMsg);
      }

      const list = data.result?.list || [];
      if (list.length > 0) {
        console.log(`[Bybit] Got ${list.length} trades in this page`);
      }

        for (const t of list) {
          const rawSymbol = (t.symbol || "").toUpperCase();
          let baseAsset = rawSymbol;
          const quotes = ["USDT", "USDC", "USDD", "USDE", "BUSD", "BTC", "ETH", "EUR", "GBP", "USD", "DAI"];
          for (const q of quotes) {
            if (rawSymbol.length > q.length && rawSymbol.endsWith(q)) {
              baseAsset = rawSymbol.slice(0, -q.length);
              break;
            }
          }

          allTrades.push({
            id: t.execId || String(Date.now()),
            orderId: t.orderId,
            symbol: baseAsset.toUpperCase(),
            side: t.side?.toLowerCase() === "buy" ? "buy" : "sell",
            qty: parseFloat(t.execQty || 0),
            price: parseFloat(t.execPrice || 0),
            fee: parseFloat(t.execFee || 0),
            feeCurrency: t.feeCurrency || "USDT",
            timestamp: new Date(parseInt(t.execTime || Date.now())).toISOString(),
          });
        }

      cursor = data.result?.nextPageCursor || "";
      hasMore = !!cursor && list.length > 0;

      if (allTrades.length > 5000) {
        console.log(`[Bybit] Safety limit reached at ${allTrades.length} trades`);
        break;
      }
    }

    if (allTrades.length > 5000) break;
    windowStart = windowEnd;
  }

  console.log(`[Bybit] Total trades fetched: ${allTrades.length}`);
  return allTrades;
}

async function fetchOkxTrades(
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  const lookbackMs = 90 * 24 * 60 * 60 * 1000; // OKX fills-history limit is 3 months
  const beginMs = Date.now() - lookbackMs;
  let afterId = "";
  let hasMore = true;

  console.log(`[OKX] Deep scan (90-day history)...`);

  while (hasMore) {
    const ts = new Date().toISOString();
    // fills-history is required for data older than 3 days
    const path = `/api/v5/trade/fills-history?instType=SPOT&limit=100&begin=${beginMs}${afterId ? `&after=${afterId}` : ""}`;
    const preSign = `${ts}GET${path}`;
    const sig = await hmacSignBase64(apiSecret, preSign);

    const res = await fetch(`https://www.okx.com${path}`, {
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": passphrase || "",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[OKX] error: ${res.status} - ${body}`);
      throw new Error(`OKX history failed: ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== "0") throw new Error(data.msg);

    const list = data.data || [];
    if (list.length > 0) {
      console.log(`[OKX] found ${list.length} historical trades`);
    }

    for (const t of list) {
      const baseAsset = (t.instId || "").split("-")[0];
      allTrades.push({
        id: t.tradeId || t.billId || String(Date.now()),
        orderId: t.ordId,
        symbol: baseAsset.toUpperCase(),
        side: t.side?.toLowerCase() || "buy",
        qty: parseFloat(t.fillSz || 0),
        price: parseFloat(t.fillPx || 0),
        fee: Math.abs(parseFloat(t.fee || 0)),
        feeCurrency: t.feeCcy || "USDT",
        timestamp: new Date(parseInt(t.ts || Date.now())).toISOString(),
      });
    }

    if (list.length === 100) {
      afterId = list[list.length - 1].tradeId;
    } else {
      hasMore = false;
    }

    if (allTrades.length > 2000) break;
  }

  console.log(`[OKX] total trades: ${allTrades.length}`);
  return allTrades;
}

async function fetchGateTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  const lookbackDays = 90;
  const windowSize = 30; // 30 days per request
  const now = Math.floor(Date.now() / 1000);
  let startTime = now - (lookbackDays * 24 * 60 * 60);

  console.log(`[Gate] Deep scan (90 days)...`);

  while (startTime < now) {
    const endTime = Math.min(startTime + (windowSize * 24 * 60 * 60), now);
    const ts = Math.floor(Date.now() / 1000);
    const path = "/api/v4/spot/my_trades";
    const query = `limit=100&from=${startTime}&to=${endTime}`;
    const hashedBody = await sha512("");
    const signStr = `GET\n${path}\n${query}\n${hashedBody}\n${ts}`;
    const sig = await hmacSign512(apiSecret, signStr);

    const res = await fetch(`https://api.gateio.ws${path}?${query}`, {
      headers: { KEY: apiKey, SIGN: sig, Timestamp: String(ts) },
    });

    if (!res.ok) {
      console.error(`[Gate] window error: ${res.status}`);
      break;
    }
    const trades = await res.json();
    if (Array.isArray(trades)) {
      for (const t of trades) {
        const baseAsset = (t.currency_pair || "").split("_")[0];
        allTrades.push({
          id: String(t.id),
          symbol: baseAsset.toUpperCase(),
          side: t.side?.toLowerCase() || "buy",
          qty: parseFloat(t.amount || 0),
          price: parseFloat(t.price || 0),
          fee: parseFloat(t.fee || 0),
          feeCurrency: t.fee_currency || "USDT",
          timestamp: new Date(parseInt(t.create_time || 0) * 1000).toISOString(),
        });
      }
    }
    startTime = endTime;
    if (allTrades.length > 2000) break;
  }

  return allTrades;
}

async function fetchKrakenTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`[Kraken] Paginating history...`);

  while (hasMore) {
    const nonce = Date.now();
    const postData = `nonce=${nonce}&ofs=${offset}`;
    const path = "/0/private/TradesHistory";
    const sig = await krakenSign(path, postData, nonce, apiSecret);
    
    const res = await fetch(`https://api.kraken.com${path}`, {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "API-Sign": sig,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postData,
    });

    if (!res.ok) throw new Error(`Kraken failed: ${res.status}`);
    const data = await res.json();
    if (data.error?.length) throw new Error(data.error.join(", "));

    const trades = data.result?.trades || {};
    const list = Object.entries(trades);
    
    for (const [id, t] of list as [string, any][]) {
      const pair = t.pair || "";
      // Map Kraken weird pair names
      const baseAsset = pair.replace(/USD[T]?$/, "").replace(/^X/, "").replace(/^Z/, "");
      allTrades.push({
        id,
        symbol: baseAsset === "BT" ? "BTC" : (baseAsset === "DG" ? "DOGE" : baseAsset.toUpperCase()),
        side: t.type?.toLowerCase() || "buy",
        qty: parseFloat(t.vol || 0),
        price: parseFloat(t.price || 0),
        fee: parseFloat(t.fee || 0),
        feeCurrency: "USD",
        timestamp: new Date(parseFloat(t.time || 0) * 1000).toISOString(),
      });
    }

    if (list.length === 50) {
      offset += 50;
    } else {
      hasMore = false;
    }
    if (allTrades.length > 1000) break;
  }

  return allTrades;
}

async function fetchCoinbaseTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  const ts = Math.floor(Date.now() / 1000);
  const path = "/v2/accounts?limit=100";
  const sig = await hmacSign(apiSecret, `${ts}GET${path}`);
  
  const accRes = await fetch(`https://api.coinbase.com${path}`, {
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": sig,
      "CB-ACCESS-TIMESTAMP": String(ts),
      "CB-VERSION": "2024-01-01",
    },
  });

  if (!accRes.ok) throw new Error(`Coinbase accounts failed`);
  const accData = await accRes.json();

  console.log(`[Coinbase] Scanning accounts...`);

  for (const acc of accData.data || []) {
    const currency = acc.currency?.code;
    if (!currency || ["USD", "USDC", "USDT", "EUR", "GBP"].includes(currency)) continue;

    for (const type of ["buys", "sells"]) {
      let nextUri = `/v2/accounts/${acc.id}/${type}?limit=100`;
      
      while (nextUri) {
        const ts2 = Math.floor(Date.now() / 1000);
        const txSig = await hmacSign(apiSecret, `${ts2}GET${nextUri}`);
        const txRes = await fetch(`https://api.coinbase.com${nextUri}`, {
          headers: {
            "CB-ACCESS-KEY": apiKey,
            "CB-ACCESS-SIGN": txSig,
            "CB-ACCESS-TIMESTAMP": String(ts2),
            "CB-VERSION": "2024-01-01",
          },
        });
        
        if (!txRes.ok) break;
        const txData = await txRes.json();
        for (const t of txData.data || []) {
          allTrades.push({
            id: t.id,
            symbol: currency,
            side: type === "buys" ? "buy" : "sell",
            qty: parseFloat(t.amount?.amount || 0),
            price: parseFloat(t.unit_price?.amount || t.subtotal?.amount || 0),
            fee: parseFloat(t.fee?.amount || 0),
            feeCurrency: t.fee?.currency || "USD",
            timestamp: t.created_at || new Date().toISOString(),
          });
        }
        nextUri = txData.pagination?.next_uri || null;
        if (allTrades.length > 2000) break;
      }
    }
  }

  return allTrades;
}

// ─── Crypto utilities ────────────────────────────────────────────────────────

async function hmacSign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSignBase64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacSign512(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha512(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-512", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function krakenSign(
  path: string,
  postData: string,
  nonce: number,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const sha256Hash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(nonce + postData)
  );
  const pathBytes = encoder.encode(path);
  const message = new Uint8Array(pathBytes.length + sha256Hash.byteLength);
  message.set(pathBytes, 0);
  message.set(new Uint8Array(sha256Hash), pathBytes.length);

  // Kraken secret is base64 encoded
  const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// ─── Transfer Fetchers (Deposits/Withdrawals) ────────────────────────────────

async function fetchBinanceTransfers(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const transfers: NormalizedTrade[] = [];
  const startTime = Date.now() - (365 * 24 * 60 * 60 * 1000); 

  // Deposits
  const depQuery = `startTime=${startTime}&timestamp=${Date.now()}`;
  const depSig = await hmacSign(apiSecret, depQuery);
  const depRes = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${depQuery}&signature=${depSig}`, {
    headers: { "X-MBX-APIKEY": apiKey }
  });
  if (depRes.ok) {
    const data = await depRes.json();
    for (const d of data) {
      if (d.status !== 1) continue;
      transfers.push({
        id: `dep_${d.id}`,
        symbol: d.coin.toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amount),
        price: 0,
        fee: 0,
        timestamp: new Date(d.insertTime).toISOString(),
      });
    }
  }

  // Withdrawals
  const witQuery = `startTime=${startTime}&timestamp=${Date.now()}`;
  const witSig = await hmacSign(apiSecret, witQuery);
  const witRes = await fetch(`https://api.binance.com/sapi/v1/capital/withdraw/history?${witQuery}&signature=${witSig}`, {
    headers: { "X-MBX-APIKEY": apiKey }
  });
  if (witRes.ok) {
    const data = await witRes.json();
    for (const w of data) {
      if (w.status !== 6) continue; // Completed
      transfers.push({
        id: `wit_${w.id}`,
        symbol: w.coin.toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amount),
        price: 0,
        fee: parseFloat(w.transactionFee || 0),
        timestamp: new Date(w.applyTime).toISOString(),
      });
    }
  }
  return transfers;
}

async function fetchBybitTransfers(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const transfers: NormalizedTrade[] = [];
  const ts = Date.now();
  const startTime = ts - (365 * 24 * 60 * 60 * 1000);
  const recvWindow = "5000";

  // Deposits
  const depParams = `startTime=${startTime}&limit=50`;
  const depPayload = `${ts}${apiKey}${recvWindow}${depParams}`;
  const depSig = await hmacSign(apiSecret, depPayload);
  const depRes = await fetch(`https://api.bybit.com/v5/asset/deposit/query-record?${depParams}`, {
    headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": depSig, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": recvWindow }
  });
  if (depRes.ok) {
    const data = await depRes.json();
    for (const d of data.result?.rows || []) {
      if (d.status !== 1) continue;
      transfers.push({
        id: `dep_${d.txID || d.depositId}`,
        symbol: d.coin.toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amount),
        price: 0,
        fee: 0,
        timestamp: new Date(parseInt(d.successTime)).toISOString(),
      });
    }
  }

  // Withdrawals
  const witParams = `startTime=${startTime}&limit=50`;
  const witPayload = `${ts}${apiKey}${recvWindow}${witParams}`;
  const witSig = await hmacSign(apiSecret, witPayload);
  const witRes = await fetch(`https://api.bybit.com/v5/asset/withdraw/query-record?${witParams}`, {
    headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": witSig, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": recvWindow }
  });
  if (witRes.ok) {
    const data = await witRes.json();
    for (const w of data.result?.rows || []) {
      if (w.status !== "WithdrawalSuccessful") continue;
      transfers.push({
        id: `wit_${w.withdrawID}`,
        symbol: w.coin.toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amount),
        price: 0,
        fee: parseFloat(w.withdrawFee || 0),
        timestamp: new Date(parseInt(w.updateTime)).toISOString(),
      });
    }
  }
  return transfers;
}

async function fetchOkxTransfers(apiKey: string, apiSecret: string, passphrase?: string | null): Promise<NormalizedTrade[]> {
  const transfers: NormalizedTrade[] = [];
  const ts = new Date().toISOString();
  const startTime = Date.now() - (90 * 24 * 60 * 60 * 1000);

  // Deposits
  const depPath = `/api/v5/asset/deposit-history?limit=100`;
  const depPre = `${ts}GET${depPath}`;
  const depSig = await hmacSignBase64(apiSecret, depPre);
  const depRes = await fetch(`https://www.okx.com${depPath}`, {
    headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": depSig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase || "" }
  });
  if (depRes.ok) {
    const data = await depRes.json();
    for (const d of data.data || []) {
      if (d.state !== "2") continue; // Success
      transfers.push({
        id: `dep_${d.depId || d.txId}`,
        symbol: d.cc.toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amt),
        price: 0,
        fee: 0,
        timestamp: new Date(parseInt(d.ts)).toISOString(),
      });
    }
  }

  // Withdrawals
  const witPath = `/api/v5/asset/withdrawal-history?limit=100`;
  const witPre = `${ts}GET${witPath}`;
  const witSig = await hmacSignBase64(apiSecret, witPre);
  const witRes = await fetch(`https://www.okx.com${witPath}`, {
    headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": witSig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase || "" }
  });
  if (witRes.ok) {
    const data = await witRes.json();
    for (const w of data.data || []) {
      if (w.state !== "2") continue; // Success
      transfers.push({
        id: `wit_${w.wdId || w.txId}`,
        symbol: w.cc.toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amt),
        price: 0,
        fee: parseFloat(w.fee || 0),
        timestamp: new Date(parseInt(w.ts)).toISOString(),
      });
    }
  }
  return transfers;
}

async function fetchBinanceDustLog(apiKey: string, apiSecret: string, startTime: number): Promise<NormalizedTrade[]> {
  const dustTrades: NormalizedTrade[] = [];
  const ts = Date.now();
  const q = `startTime=${startTime}&timestamp=${ts}`;
  const sig = await hmacSign(apiSecret, q);
  const res = await fetch(`https://api.binance.com/sapi/v1/asset/dust-log?${q}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const logs = data.userAssetDribblets || [];

  for (const log of logs) {
    for (const item of log.userAssetDribbletDetails || []) {
      const fromSym = (item.fromAsset || "").toUpperCase();
      dustTrades.push({
        id: `dust_${item.transId || Math.random()}`,
        symbol: fromSym,
        side: "sell",
        qty: parseFloat(item.amount),
        price: parseFloat(item.transferedAmount) / parseFloat(item.amount),
        fee: parseFloat(item.serviceChargeAmount || 0),
        feeCurrency: "BNB",
        timestamp: new Date(log.operateTime).toISOString(),
      });
    }
  }
  return dustTrades;
}
