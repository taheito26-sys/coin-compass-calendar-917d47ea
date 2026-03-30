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
        const body = await req.json().catch(() => ({}));
        const options = {
          period: body.period || 90,
          types: body.types || ["buy", "sell", "transfer_in", "transfer_out"],
          preview: body.preview || false,
          coins: body.coins || [],
        };

        const result = await syncExchangeTrades(
          supabase,
          user.id,
          exchangeId,
          conn.api_key,
          conn.api_secret,
          conn.passphrase,
          options
        );

        if (!options.preview && result.ok) {
          await supabase
            .from("exchange_connections")
            .update({
              last_sync: new Date().toISOString(),
              sync_count: (conn.sync_count || 0) + result.synced,
              status: "connected",
              updated_at: new Date().toISOString(),
            })
            .eq("id", conn.id);
        }

        return json(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Sync failed";
        console.error(`[sync-error] ${exchangeId}: ${message}`);
        await supabase
          .from("exchange_connections")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", conn.id);
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
      const res = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
      if (res.ok) return { ok: true, message: "Binance connection verified ✓" };
      return { ok: false, message: "Binance verification failed" };
    }
    case "bybit": {
      const ts = Date.now();
      const query = "accountType=UNIFIED";
      const payload = `${ts}${apiKey}5000${query}`;
      const sig = await hmacSign(apiSecret, payload);
      const res = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${query}`, {
        headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000" }
      });
      if (res.ok) return { ok: true, message: "Bybit connection verified ✓" };
      return { ok: false, message: "Bybit verification failed" };
    }
    case "okx": {
      const ts = new Date().toISOString();
      const path = "/api/v5/account/balance";
      const sig = await hmacSignBase64(apiSecret, `${ts}GET${path}`);
      const res = await fetch(`https://www.okx.com${path}`, {
        headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": sig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase || "" }
      });
      if (res.ok) return { ok: true, message: "OKX connection verified ✓" };
      return { ok: false, message: "OKX verification failed" };
    }
    case "gate": {
      const ts = Math.floor(Date.now() / 1000);
      const path = "/api/v4/spot/accounts";
      const hashedBody = await sha512("");
      const sig = await hmacSign512(apiSecret, `GET\n${path}\n\n${hashedBody}\n${ts}`);
      const res = await fetch(`https://api.gateio.ws${path}`, { headers: { KEY: apiKey, SIGN: sig, Timestamp: String(ts) } });
      if (res.ok) return { ok: true, message: "Gate.io connection verified ✓" };
      return { ok: false, message: "Gate.io verification failed" };
    }
    case "kraken": {
      const nonce = Date.now();
      const postData = `nonce=${nonce}`;
      const path = "/0/private/Balance";
      const sig = await krakenSign(path, postData, nonce, apiSecret);
      const res = await fetch(`https://api.kraken.com${path}`, {
        method: "POST", headers: { "API-Key": apiKey, "API-Sign": sig, "Content-Type": "application/x-www-form-urlencoded" }, body: postData
      });
      if (res.ok) return { ok: true, message: "Kraken connection verified ✓" };
      return { ok: false, message: "Kraken verification failed" };
    }
    case "coinbase": {
      const ts = Math.floor(Date.now() / 1000);
      const path = "/v2/accounts";
      const sig = await hmacSign(apiSecret, `${ts}GET${path}`);
      const res = await fetch(`https://api.coinbase.com${path}`, {
        headers: { "CB-ACCESS-KEY": apiKey, "CB-ACCESS-SIGN": sig, "CB-ACCESS-TIMESTAMP": String(ts), "CB-VERSION": "2024-01-01" }
      });
      if (res.ok) return { ok: true, message: "Coinbase connection verified ✓" };
      return { ok: false, message: "Coinbase verification failed" };
    }
    default:
      return { ok: false, message: `Unsupported exchange: ${exchange}` };
  }
}

interface NormalizedTrade {
  id: string;
  orderId?: string;
  symbol: string;
  side: "buy" | "sell" | "transfer_in" | "transfer_out";
  qty: number;
  price: number;
  fee: number;
  feeCurrency?: string;
  timestamp: string;
}

async function syncExchangeTrades(
  supabase: any,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null,
  options: { period: number; types: string[]; preview: boolean; coins: string[] } = { period: 90, types: ["buy", "sell", "transfer_in", "transfer_out"], preview: false, coins: [] }
): Promise<{ ok: boolean; synced: number; skipped: number; previewData?: any[] }> {
  let trades: NormalizedTrade[] = [];
  let transfers: NormalizedTrade[] = [];
  const lookbackDays = options.period || 90;

  console.log(`[sync] ${exchange}: Scanning ${lookbackDays}d (Preview: ${options.preview})`);

  // Get recently active assets to focus scan
  const { data: userAssets } = await supabase.from("transactions").select("assets(symbol)").eq("user_id", userId).eq("venue", exchange);
  const knownSymbols = new Set<string>();
  for (const row of userAssets || []) {
    const s = row.assets?.symbol;
    if (s) knownSymbols.add(s.toUpperCase());
  }

  try {
    switch (exchange) {
      case "binance":
        trades = await fetchBinanceTrades(apiKey, apiSecret, Array.from(knownSymbols), lookbackDays);
        if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
          transfers = await fetchBinanceTransfers(apiKey, apiSecret, lookbackDays);
        }
        break;
      case "bybit":
        trades = await fetchBybitTrades(apiKey, apiSecret, lookbackDays);
        if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
          transfers = await fetchBybitTransfers(apiKey, apiSecret, lookbackDays);
        }
        break;
      case "okx":
        trades = await fetchOkxTrades(apiKey, apiSecret, conn.passphrase || null, lookbackDays);
        if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
          transfers = await fetchOkxTransfers(apiKey, apiSecret, conn.passphrase || null, lookbackDays);
        }
        break;
      case "gate": trades = await fetchGateTrades(apiKey, apiSecret, lookbackDays); break;
      case "kraken": trades = await fetchKrakenTrades(apiKey, apiSecret, lookbackDays); break;
      case "coinbase": trades = await fetchCoinbaseTrades(apiKey, apiSecret, lookbackDays); break;
      default: throw new Error(`Unsupported exchange: ${exchange}`);
    }
  } catch (err) {
    console.error(`[fetch-error] ${exchange}:`, err);
    throw err;
  }

  // Filter & Deduplicate
  let allHistory = [...trades, ...transfers]
    .filter(t => options.types.includes(t.side))
    .filter(t => options.coins.length === 0 || options.coins.includes(t.symbol.toUpperCase()))
    .filter(t => {
      // Exclude stablecoin (USDT/USDC) transfers as they often clutter the ledger
      const isTransfer = t.side === "transfer_in" || t.side === "transfer_out";
      const isStable = ["USDT", "USDC", "FDUSD", "TUSD"].includes(t.symbol.toUpperCase());
      return !(isTransfer && isStable);
    });

  if (allHistory.length === 0) return { ok: true, synced: 0, skipped: 0 };

  // Compaction Logic: Merges fragmented fills (cluster trades)
  const sorted = allHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const clusters: (NormalizedTrade & { _lastTs: number })[] = [];

  for (const t of sorted) {
    const tTime = new Date(t.timestamp).getTime();
    let existingIndex = -1;
    
    // Find a cluster of same symbol/side within 15 minutes
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      if (c.symbol === t.symbol && c.side === t.side) {
        const diffMs = Math.abs(tTime - c._lastTs);
        const sameOrder = t.orderId && c.orderId && t.orderId === c.orderId;
        if (sameOrder || diffMs < 15 * 60 * 1000) {
          existingIndex = i;
          break;
        }
      }
    }

    if (existingIndex !== -1) {
      const existing = clusters[existingIndex];
      const totalQty = existing.qty + t.qty;
      if (totalQty > 0) {
        // Calculate VWAP
        existing.price = (existing.price * existing.qty + t.price * t.qty) / totalQty;
      }
      existing.qty = totalQty;
      existing.fee += (t.fee || 0);
      existing._lastTs = Math.max(existing._lastTs, tTime);
      // Keep original timestamp
    } else {
      clusters.push({ ...t, _lastTs: tTime });
    }
  }

  if (options.preview) return { ok: true, synced: clusters.length, skipped: 0, previewData: clusters };

  let synced = 0, skipped = 0;
  
  // Persist
  for (const trade of clusters) {
    const { data: asset } = await supabase.from("assets").select("id").or(`symbol.eq.${trade.symbol},binance_symbol.eq.${trade.symbol}`).limit(1).single();
    let assetId = asset?.id;
    if (!assetId) {
      const { data: newAsset } = await supabase.from("assets").insert({ symbol: trade.symbol, name: trade.symbol }).select("id").single();
      assetId = newAsset?.id;
    }
    if (!assetId) { skipped++; continue; }

    const externalId = trade.orderId ? `${exchange}_order_${trade.orderId}` : `${exchange}_cluster_${trade.id}`;
    const { data: existing } = await supabase.from("transactions").select("id").eq("user_id", userId).eq("external_id", externalId).single();
    if (existing) { skipped++; continue; }

    const { error } = await supabase.from("transactions").insert({
      user_id: userId, asset_id: assetId, type: trade.side, qty: trade.qty, unit_price: trade.price,
      fee_amount: trade.fee, fee_currency: trade.feeCurrency || "USD", timestamp: trade.timestamp,
      source: `api_${exchange}`, venue: exchange, external_id: externalId
    });
    if (!error) synced++; else skipped++;
  }

  return { ok: true, synced, skipped };
}

// --- Specific Fetchers ---

async function fetchBinanceTrades(apiKey: string, apiSecret: string, knownAssets: string[], lookbackDays: number): Promise<NormalizedTrade[]> {
  const ts = Date.now();
  const sig = await hmacSign(apiSecret, `timestamp=${ts}`);
  const accRes = await fetch(`https://api.binance.com/api/v3/account?timestamp=${ts}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
  if (!accRes.ok) return [];
  const account = await accRes.json();
  const balances = (account.balances || []).filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0).map((b: any) => b.asset);
  const assets = Array.from(new Set([...balances, ...knownAssets, "BTC", "ETH", "SOL", "BNB"]));
  
  const allTrades: NormalizedTrade[] = [];
  const startTime = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
  const quotes = ["USDT", "USDC", "BTC", "FDUSD"];

  for (const asset of assets) {
    if (quotes.includes(asset)) continue;
    for (const q of quotes) {
      const symbol = `${asset}${q}`;
      const ts2 = Date.now();
      const query = `symbol=${symbol}&startTime=${startTime}&timestamp=${ts2}`;
      const s = await hmacSign(apiSecret, query);
      const res = await fetch(`https://api.binance.com/api/v3/myTrades?${query}&signature=${s}`, { headers: { "X-MBX-APIKEY": apiKey } });
      if (!res.ok) continue;
      const trades = await res.json();
      if (!Array.isArray(trades)) continue;
      for (const t of trades) {
        allTrades.push({
          id: String(t.id), orderId: String(t.orderId), symbol: asset, side: t.isBuyer ? "buy" : "sell",
          qty: parseFloat(t.qty), price: parseFloat(t.price), fee: parseFloat(t.commission), feeCurrency: t.commissionAsset, timestamp: new Date(t.time).toISOString()
        });
      }
    }
  }
  const dust = await fetchBinanceDustLog(apiKey, apiSecret, startTime);
  return [...allTrades, ...dust];
}

async function fetchBybitTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<NormalizedTrade[]> {
  const allTrades: NormalizedTrade[] = [];
  const start = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
  let windowStart = start;
  const windowSize = 7 * 24 * 60 * 60 * 1000;

  while (windowStart < Date.now()) {
    const end = Math.min(windowStart + windowSize, Date.now());
    let cursor = "";
    let hasMore = true;
    while (hasMore) {
      const ts = Date.now();
      const params = `category=spot&startTime=${windowStart}&endTime=${end}&limit=100${cursor ? `&cursor=${cursor}` : ""}`;
      const sig = await hmacSign(apiSecret, `${ts}${apiKey}5000${params}`);
      const res = await fetch(`https://api.bybit.com/v5/execution/list?${params}`, {
        headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000" }
      });
      if (!res.ok) break;
      const data = await res.json();
      const list = data.result?.list || [];
      for (const t of list) {
        const symbol = t.symbol.replace(/USDT$|USDC$|BTC$/, "");
        allTrades.push({
          id: t.execId, orderId: t.orderId, symbol, side: t.side.toLowerCase() === "buy" ? "buy" : "sell",
          qty: parseFloat(t.execQty), price: parseFloat(t.execPrice), fee: parseFloat(t.execFee), feeCurrency: t.feeCurrency, timestamp: new Date(parseInt(t.execTime)).toISOString()
        });
      }
      cursor = data.result?.nextPageCursor;
      hasMore = !!cursor && list.length > 0;
    }
    windowStart = end;
    if (allTrades.length > 2000) break;
  }
  return allTrades;
}

async function fetchOkxTrades(apiKey: string, apiSecret: string, passphrase: string|null, lookbackDays: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  
  // OKX fills-history strictly caps at 90 days. We use 85 for safety margin.
  const safeLookbackDays = Math.min(lookbackDays, 85);
  const start = Date.now() - (safeLookbackDays * 24 * 60 * 60 * 1000);
  
  const endpoints = ["/api/v5/trade/fills", "/api/v5/trade/fills-history"];

  for (const ep of endpoints) {
    let afterId = "";
    let hasMore = true;
    let pages = 0;
    while (hasMore && pages < 20) {
      pages++;
      const ts = new Date().toISOString();
      const extra = ep.includes("history") ? `&begin=${start}` : "";
      const path = `${ep}?instType=SPOT&limit=100${extra}${afterId ? `&after=${afterId}` : ""}`;
      const sig = await hmacSignBase64(apiSecret, `${ts}GET${path}`);
      
      try {
        const res = await fetch(`https://www.okx.com${path}`, { 
          headers: { 
            "OK-ACCESS-KEY": apiKey, 
            "OK-ACCESS-SIGN": sig, 
            "OK-ACCESS-TIMESTAMP": ts, 
            "OK-ACCESS-PASSPHRASE": passphrase||"" 
          } 
        });
        
        if (!res.ok) {
          const body = await res.text();
          console.error(`[OKX] API error (${ep}): ${res.status} — ${body}`);
          // If this is history endpoint and it fails, don't stop entirely, try next?
          break;
        }
        
        const data = await res.json();
        const list = data.data || [];
        for (const t of list) {
          if (!t.instId) continue;
          all.push({
            id: t.tradeId, 
            orderId: t.ordId, 
            symbol: (t.instId || "").split("-")[0] || "UNKNOWN", 
            side: (t.side || "").toLowerCase() as any,
            qty: parseFloat(t.fillSz || 0), 
            price: parseFloat(t.fillPx || 0), 
            fee: Math.abs(parseFloat(t.fee || 0)), 
            feeCurrency: t.feeCcy, 
            timestamp: new Date(parseInt(t.ts)).toISOString()
          });
        }
        if (list.length < 100) hasMore = false; else afterId = list[list.length-1].tradeId;
      } catch (err) {
        console.error(`[OKX] Network error:`, err);
        break;
      }
    }
  }
  const unique = new Map();
  for (const t of all) unique.set(t.id, t);
  return Array.from(unique.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function fetchGateTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const startTs = Math.floor((Date.now() - (lookbackDays * 24 * 60 * 60 * 1000)) / 1000);
  const ts = Math.floor(Date.now() / 1000);
  
  // Gate.io v4 signing
  const method = "GET";
  const url = "/api/v4/spot/my_trades";
  const query = `limit=1000&from=${startTs}`;
  const hashedBody = await sha512(""); // Empty body for GET
  const payload = `${method}\n${url}\n${query}\n${hashedBody}\n${ts}`;
  const sig = await hmacSign512(apiSecret, payload);

  const res = await fetch(`https://api.gateio.ws${url}?${query}`, {
    headers: {
      "KEY": apiKey,
      "SIGN": sig,
      "Timestamp": String(ts)
    }
  });

  if (!res.ok) {
    console.error(`[Gate.io] Error: ${res.status}`);
    return [];
  }

  const list = await res.json();
  for (const t of (list as any[])) {
    all.push({
      id: String(t.id), orderId: String(t.order_id), symbol: t.currency_pair.split("_")[0], side: t.side,
      qty: parseFloat(t.amount), price: parseFloat(t.price), fee: parseFloat(t.fee), feeCurrency: t.fee_currency, timestamp: new Date(t.create_time * 1000).toISOString()
    });
  }
  return all;
}

async function fetchKrakenTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const startTs = Math.floor((Date.now() - (lookbackDays * 24 * 60 * 60 * 1000)) / 1000);
  const nonce = Date.now() * 1000;
  const path = "/0/private/TradesHistory";
  const body = `nonce=${nonce}&start=${startTs}`;
  const sig = await krakenSign(path, `nonce=${nonce}&start=${startTs}`, nonce, apiSecret);

  const res = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sig,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) return [];
  const data = await res.json();
  const trades = data.result?.trades || {};
  for (const tid in trades) {
    const t = trades[tid];
    all.push({
      id: tid, orderId: t.ordertxid, symbol: t.pair.replace(/XBT$|USD$|EUR$|USDT$/, ""), side: t.type === "buy" ? "buy" : "sell",
      qty: parseFloat(t.vol), price: parseFloat(t.price), fee: parseFloat(t.fee), feeCurrency: "USD", timestamp: new Date(t.time * 1000).toISOString()
    });
  }
  return all;
}

async function fetchCoinbaseTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const ts = Math.floor(Date.now() / 1000).toString();
  const startTs = new Date(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000)).toISOString();
  
  // Coinbase Advanced Trade signing
  const method = "GET";
  const path = "/api/v3/brokerage/orders/historical/fills";
  const query = `start_sequence_timestamp=${startTs}&limit=100`;
  const message = ts + method + path + "?" + query;
  const sig = await hmacSign(apiSecret, message);

  const res = await fetch(`https://api.coinbase.com${path}?${query}`, {
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": sig,
      "CB-ACCESS-TIMESTAMP": ts,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) return [];
  const data = await res.json();
  const fills = data.fills || [];
  for (const f of fills) {
    all.push({
      id: f.entry_id, orderId: f.order_id, symbol: f.product_id.split("-")[0], side: f.side.toLowerCase(),
      qty: parseFloat(f.size), price: parseFloat(f.price), fee: parseFloat(f.commission), feeCurrency: "USD", timestamp: f.trade_time
    });
  }
  return all;
}

// --- Helpers ---

async function hmacSign(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSignBase64(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacSign512(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha512(message: string) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-512", encoder.encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function krakenSign(path: string, postData: string, nonce: number, secret: string) {
  const encoder = new TextEncoder();
  const sha256 = await crypto.subtle.digest("SHA-256", encoder.encode(nonce + postData));
  const message = new Uint8Array(encoder.encode(path).length + sha256.byteLength);
  message.set(encoder.encode(path), 0); message.set(new Uint8Array(sha256), encoder.encode(path).length);
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(secret), c => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function fetchBinanceTransfers(apiKey: string, apiSecret: string, lookback: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const start = Date.now() - (lookback * 24 * 60 * 60 * 1000);
  const q = `startTime=${start}&timestamp=${Date.now()}`;
  const sig = await hmacSign(apiSecret, q);
  const res = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${q}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
  if (res.ok) {
    const data = await res.json();
    for (const d of data) {
      if (d.status === 1) all.push({ id: `dep_${d.id}`, symbol: d.coin.toUpperCase(), side: "transfer_in", qty: parseFloat(d.amount), price: 0, fee: 0, timestamp: new Date(d.insertTime).toISOString() });
    }
  }
  const q2 = `startTime=${start}&timestamp=${Date.now()}`;
  const sig2 = await hmacSign(apiSecret, q2);
  const res2 = await fetch(`https://api.binance.com/sapi/v1/capital/withdraw/history?${q2}&signature=${sig2}`, { headers: { "X-MBX-APIKEY": apiKey } });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data) {
      if (w.status === 6) all.push({ id: `wit_${w.id}`, symbol: w.coin.toUpperCase(), side: "transfer_out", qty: parseFloat(w.amount), price: 0, fee: parseFloat(w.transactionFee||0), timestamp: new Date(w.applyTime).toISOString() });
    }
  }
  return all;
}

async function fetchBybitTransfers(apiKey: string, apiSecret: string, lookback: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const start = Date.now() - (lookback * 24 * 60 * 60 * 1000);
  const ts = Date.now();
  const q = `startTime=${start}&limit=50`;
  const sig = await hmacSign(apiSecret, `${ts}${apiKey}5000${q}`);
  const res = await fetch(`https://api.bybit.com/v5/asset/deposit/query-record?${q}`, { headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000" } });
  if (res.ok) {
    const data = await res.json();
    for (const d of data.result?.rows || []) {
      if (d.status === 1) all.push({ id: `dep_${d.txID||d.depositId}`, symbol: d.coin.toUpperCase(), side: "transfer_in", qty: parseFloat(d.amount), price: 0, fee: 0, timestamp: new Date(parseInt(d.successTime)).toISOString() });
    }
  }
  const sig2 = await hmacSign(apiSecret, `${ts}${apiKey}5000${q}`);
  const res2 = await fetch(`https://api.bybit.com/v5/asset/withdraw/query-record?${q}`, { headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": sig2, "X-BAPI-TIMESTAMP": String(ts), "X-BAPI-RECV-WINDOW": "5000" } });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data.result?.rows || []) {
      if (w.status === "WithdrawalSuccessful") all.push({ id: `wit_${w.withdrawID}`, symbol: w.coin.toUpperCase(), side: "transfer_out", qty: parseFloat(w.amount), price: 0, fee: parseFloat(w.withdrawFee||0), timestamp: new Date(parseInt(w.updateTime)).toISOString() });
    }
  }
  return all;
}

async function fetchOkxTransfers(apiKey: string, apiSecret: string, passphrase: string|null, lookback: number): Promise<NormalizedTrade[]> {
  const all: NormalizedTrade[] = [];
  const ts = new Date().toISOString();
  const path = `/api/v5/asset/deposit-history?limit=100`;
  const sig = await hmacSignBase64(apiSecret, `${ts}GET${path}`);
  const res = await fetch(`https://www.okx.com${path}`, { headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": sig, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase||"" } });
  if (res.ok) {
    const data = await res.json();
    for (const d of data.data || []) {
      if (d.state === "2") all.push({ id: `dep_${d.depId||d.txId}`, symbol: d.cc.toUpperCase(), side: "transfer_in", qty: parseFloat(d.amt), price: 0, fee: 0, timestamp: new Date(parseInt(d.ts)).toISOString() });
    }
  }
  const path2 = `/api/v5/asset/withdrawal-history?limit=100`;
  const sig2 = await hmacSignBase64(apiSecret, `${ts}GET${path2}`);
  const res2 = await fetch(`https://www.okx.com${path2}`, { headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": sig2, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": passphrase||"" } });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data.data || []) {
      if (w.state === "2") all.push({ id: `wit_${w.wdId||w.txId}`, symbol: w.cc.toUpperCase(), side: "transfer_out", qty: parseFloat(w.amt), price: 0, fee: parseFloat(w.fee||0), timestamp: new Date(parseInt(w.ts)).toISOString() });
    }
  }
  return all;
}

async function fetchBinanceDustLog(apiKey: string, apiSecret: string, startTime: number): Promise<NormalizedTrade[]> {
  const trades: NormalizedTrade[] = [];
  const q = `startTime=${startTime}&timestamp=${Date.now()}`;
  const sig = await hmacSign(apiSecret, q);
  const res = await fetch(`https://api.binance.com/sapi/v1/asset/dust-log?${q}&signature=${sig}`, { headers: { "X-MBX-APIKEY": apiKey } });
  if (!res.ok) return [];
  const data = await res.json();
  for (const log of data.userAssetDribblets || []) {
    for (const item of log.userAssetDribbletDetails || []) {
      trades.push({
        id: `dust_${item.transId}`, symbol: item.fromAsset.toUpperCase(), side: "sell", qty: parseFloat(item.amount),
        price: parseFloat(item.transferedAmount)/parseFloat(item.amount), fee: parseFloat(item.serviceChargeAmount||0), feeCurrency: "BNB", timestamp: new Date(log.operateTime).toISOString()
      });
    }
  }
  return trades;
}
