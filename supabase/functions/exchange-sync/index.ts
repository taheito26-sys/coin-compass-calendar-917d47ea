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

// ─── Sync trades ─────────────────────────────────────────────────────────────

async function syncExchangeTrades(
  supabase: any,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<{ ok: boolean; synced: number; skipped: number }> {
  let trades: any[] = [];

  console.log(`[sync] Fetching trades from ${exchange}...`);

  switch (exchange) {
    case "binance":
      trades = await fetchBinanceTrades(apiKey, apiSecret);
      break;
    case "bybit":
      trades = await fetchBybitTrades(apiKey, apiSecret);
      break;
    case "okx":
      trades = await fetchOkxTrades(apiKey, apiSecret, passphrase);
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

  console.log(`[sync] ${exchange}: fetched ${trades.length} trades`);

  if (!trades.length) return { ok: true, synced: 0, skipped: 0 };

  // --- Trade Compaction Logic ---
  // Group trades that happen at the same time, price, and side to avoid fragmentation
  const compacted: NormalizedTrade[] = [];
  const groups = new Map<string, NormalizedTrade>();

  for (const t of trades) {
    // Minute-level grouping (Bybit/Binance often fill a single order in dozens of pieces within 1 second)
    const minuteTs = t.timestamp.substring(0, 16); // "YYYY-MM-DDTHH:mm"
    const key = `${t.symbol}|${t.side}|${t.price}|${minuteTs}`;
    
    if (groups.has(key)) {
      const existing = groups.get(key)!;
      existing.qty += t.qty;
      existing.fee += t.fee;
      // We append IDs to keep track for idempotency if needed, 
      // but usually the first trade ID + key hash is enough
    } else {
      groups.set(key, { ...t });
    }
  }
  
  const finalTrades = Array.from(groups.values());

  let synced = 0;
  let skipped = 0;

  for (const trade of finalTrades) {
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

    // Check for duplicate by external_id
    // For compacted trades, we use a hash of the group key to maintain idempotency
    const minuteTs = trade.timestamp.substring(0, 16);
    const externalId = `${exchange}_compact_${trade.symbol}_${trade.side}_${trade.price}_${minuteTs}`;

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

  return { ok: true, synced, skipped };
}

// ─── Exchange-specific trade fetchers ────────────────────────────────────────

interface NormalizedTrade {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  fee: number;
  feeCurrency: string;
  timestamp: string;
}

async function fetchBinanceTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  // Get exchange info for symbols
  const ts = Date.now();
  const query = `timestamp=${ts}`;
  const sig = await hmacSign(apiSecret, query);
  const accRes = await fetch(
    `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  if (!accRes.ok) throw new Error(`Binance account fetch failed: ${accRes.status}`);
  const account = await accRes.json();

  // Get non-zero balances to find relevant symbols
  const balances = (account.balances || []).filter(
    (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
  );
  const assets = balances.map((b: any) => b.asset as string);

  const allTrades: NormalizedTrade[] = [];
  const quotes = ["USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "BTC", "ETH", "BNB"];

  for (const asset of assets) {
    if (quotes.includes(asset)) continue;
    
    // Try common quote currencies for this asset
    const possibleSymbols = quotes.map(q => `${asset}${q}`);
    
    for (const symbol of possibleSymbols) {
      const ts2 = Date.now();
      const q = `symbol=${symbol}&limit=1000&timestamp=${ts2}`;
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
          symbol: asset,
          side: t.isBuyer ? "buy" : "sell",
          qty: parseFloat(t.qty),
          price: parseFloat(t.price),
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
  const maxHistory = 180 * 24 * 60 * 60 * 1000; // 180 days
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
          id: t.execId || t.orderId || String(Date.now()),
          symbol: baseAsset,
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
  const ts = new Date().toISOString();
  const path = "/api/v5/trade/fills?instType=SPOT&limit=100";
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
  if (!res.ok) throw new Error(`OKX trades failed: ${res.status}`);
  const data = await res.json();
  if (data.code !== "0") throw new Error(data.msg);

  return (data.data || []).map((t: any) => {
    const baseAsset = (t.instId || "").split("-")[0];
    return {
      id: t.tradeId || t.billId || String(Date.now()),
      symbol: baseAsset,
      side: t.side?.toLowerCase() || "buy",
      qty: parseFloat(t.fillSz || 0),
      price: parseFloat(t.fillPx || 0),
      fee: Math.abs(parseFloat(t.fee || 0)),
      feeCurrency: t.feeCcy || "USDT",
      timestamp: new Date(parseInt(t.ts || Date.now())).toISOString(),
    };
  });
}

async function fetchGateTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const ts = Math.floor(Date.now() / 1000);
  const path = "/api/v4/spot/my_trades";
  const query = "limit=100";
  const hashedBody = await sha512("");
  const signStr = `GET\n${path}\n${query}\n${hashedBody}\n${ts}`;
  const sig = await hmacSign512(apiSecret, signStr);
  const res = await fetch(`https://api.gateio.ws${path}?${query}`, {
    headers: { KEY: apiKey, SIGN: sig, Timestamp: String(ts) },
  });
  if (!res.ok) throw new Error(`Gate trades failed: ${res.status}`);
  const trades = await res.json();

  return (trades || []).map((t: any) => {
    const baseAsset = (t.currency_pair || "").split("_")[0];
    return {
      id: String(t.id),
      symbol: baseAsset,
      side: t.side?.toLowerCase() || "buy",
      qty: parseFloat(t.amount || 0),
      price: parseFloat(t.price || 0),
      fee: parseFloat(t.fee || 0),
      feeCurrency: t.fee_currency || "USDT",
      timestamp: new Date(parseInt(t.create_time || 0) * 1000).toISOString(),
    };
  });
}

async function fetchKrakenTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const nonce = Date.now();
  const postData = `nonce=${nonce}`;
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
  if (!res.ok) throw new Error(`Kraken trades failed: ${res.status}`);
  const data = await res.json();
  if (data.error?.length) throw new Error(data.error.join(", "));

  const trades = data.result?.trades || {};
  return Object.entries(trades).map(([id, t]: [string, any]) => {
    const pair = t.pair || "";
    // Kraken pairs: e.g., XBTUSDT, ETHUSDT
    const baseAsset = pair.replace(/USD[T]?$/, "").replace(/^X/, "");
    return {
      id,
      symbol: baseAsset === "BT" ? "BTC" : baseAsset,
      side: t.type?.toLowerCase() || "buy",
      qty: parseFloat(t.vol || 0),
      price: parseFloat(t.price || 0),
      fee: parseFloat(t.fee || 0),
      feeCurrency: "USD",
      timestamp: new Date(parseFloat(t.time || 0) * 1000).toISOString(),
    };
  });
}

async function fetchCoinbaseTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const ts = Math.floor(Date.now() / 1000);
  const path = "/v2/accounts";
  const preSign = `${ts}GET${path}`;
  const sig = await hmacSign(apiSecret, preSign);
  const accRes = await fetch(`https://api.coinbase.com${path}`, {
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": sig,
      "CB-ACCESS-TIMESTAMP": String(ts),
      "CB-VERSION": "2024-01-01",
    },
  });
  if (!accRes.ok) throw new Error(`Coinbase accounts failed: ${accRes.status}`);
  const accData = await accRes.json();

  const allTrades: NormalizedTrade[] = [];
  for (const acc of accData.data || []) {
    if (parseFloat(acc.balance?.amount || "0") === 0) continue;
    const currency = acc.currency?.code;
    if (!currency || ["USD", "USDC", "USDT"].includes(currency)) continue;

    for (const txType of ["buys", "sells"]) {
      const ts2 = Math.floor(Date.now() / 1000);
      const txPath = `/v2/accounts/${acc.id}/${txType}`;
      const txSig = await hmacSign(apiSecret, `${ts2}GET${txPath}`);
      const txRes = await fetch(`https://api.coinbase.com${txPath}`, {
        headers: {
          "CB-ACCESS-KEY": apiKey,
          "CB-ACCESS-SIGN": txSig,
          "CB-ACCESS-TIMESTAMP": String(ts2),
          "CB-VERSION": "2024-01-01",
        },
      });
      if (!txRes.ok) continue;
      const txData = await txRes.json();
      for (const t of txData.data || []) {
        allTrades.push({
          id: t.id || String(Date.now()),
          symbol: currency,
          side: txType === "buys" ? "buy" : "sell",
          qty: parseFloat(t.amount?.amount || 0),
          price: parseFloat(t.unit_price?.amount || t.subtotal?.amount || 0),
          fee: parseFloat(t.fee?.amount || 0),
          feeCurrency: t.fee?.currency || "USD",
          timestamp: t.created_at || new Date().toISOString(),
        });
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
