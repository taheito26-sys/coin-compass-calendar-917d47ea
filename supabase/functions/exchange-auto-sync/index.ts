/**
 * exchange-auto-sync — Server-side cron function that syncs all exchange connections.
 * Called by pg_cron every 30 minutes. Uses service role to iterate all users.
 * Logs results to exchange_sync_logs table.
 *
 * All fetcher functions mirror the improved logic in exchange-sync/index.ts
 * (windowed pagination, fresh HMAC per request, safety limits).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { compactTrades } from "../_shared/compaction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STABLECOIN_SYMBOLS = new Set([
  "USDT", "USDC", "FDUSD", "TUSD", "DAI", "USDD", "USDE", "BUSD", "PYUSD", "USDP", "USD"
]);


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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: connections, error: connErr } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("status", "connected");

    if (connErr) {
      console.error("[auto-sync] Failed to fetch connections:", connErr);
      return json({ error: connErr.message }, 500);
    }

    if (!connections || connections.length === 0) {
      console.log("[auto-sync] No active connections to sync");
      return json({ ok: true, message: "No connections to sync", results: [] });
    }

    console.log(`[auto-sync] Syncing ${connections.length} connection(s)…`);

    const results: Array<{
      user_id: string;
      exchange: string;
      synced: number;
      skipped: number;
      error?: string;
    }> = [];

    for (const conn of connections) {
      try {
        const result = await syncExchangeTrades(
          supabase,
          conn.user_id,
          conn.exchange,
          conn.api_key,
          conn.api_secret,
          conn.passphrase
        );

        await supabase
          .from("exchange_connections")
          .update({
            last_sync: new Date().toISOString(),
            sync_count: (conn.sync_count || 0) + (result.synced || 0),
            status: "connected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id);

        await supabase.from("exchange_sync_logs").insert({
          user_id: conn.user_id,
          exchange: conn.exchange,
          synced_count: result.synced,
          skipped_count: result.skipped,
          status: "success",
          trigger: "cron",
        });

        results.push({
          user_id: conn.user_id,
          exchange: conn.exchange,
          synced: result.synced,
          skipped: result.skipped,
        });

        console.log(
          `[auto-sync] ${conn.exchange}@${conn.user_id.slice(0, 8)}: ${result.synced} synced, ${result.skipped} skipped`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[auto-sync] ${conn.exchange}@${conn.user_id.slice(0, 8)} failed:`, message);

        await supabase
          .from("exchange_connections")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", conn.id);

        await supabase.from("exchange_sync_logs").insert({
          user_id: conn.user_id,
          exchange: conn.exchange,
          synced_count: 0,
          skipped_count: 0,
          status: "error",
          error_message: message,
          trigger: "cron",
        });

        results.push({
          user_id: conn.user_id,
          exchange: conn.exchange,
          synced: 0,
          skipped: 0,
          error: message,
        });
      }
    }

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const totalErrors = results.filter((r) => r.error).length;
    console.log(
      `[auto-sync] Complete: ${totalSynced} trades synced, ${totalErrors} errors across ${connections.length} connections`
    );

    return json({
      ok: true,
      total_connections: connections.length,
      total_synced: totalSynced,
      total_errors: totalErrors,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[auto-sync] Fatal error:", message);
    return json({ error: message }, 500);
  }
});

// ─── Sync trades (same logic as exchange-sync) ──────────────────────────────

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

async function syncExchangeTrades(
  supabase: any,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<{ ok: boolean; synced: number; skipped: number }> {
  let trades: NormalizedTrade[] = [];

  console.log(`[auto-sync] Fetching trades from ${exchange}...`);

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

  console.log(`[auto-sync] ${exchange}: fetched ${trades.length} trades`);

  if (!trades.length) return { ok: true, synced: 0, skipped: 0 };

  // --- Stablecoin Removal & Trade Compaction ---
  const filteredTrades = trades.filter((t) => !STABLECOIN_SYMBOLS.has(t.symbol.toUpperCase()));
  
  const { trades: finalTrades } = compactTrades(filteredTrades as any, {
    timeWindowSeconds: 60,
    priceTolerancePercent: 0.15,
  });


  let synced = 0;
  let skipped = 0;

  for (const trade of finalTrades) {
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

async function fetchBinanceTrades(apiKey: string, apiSecret: string): Promise<NormalizedTrade[]> {
  const ts = Date.now();
  const query = `timestamp=${ts}`;
  const sig = await hmacSign(apiSecret, query);
  const accRes = await fetch(
    `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  if (!accRes.ok) throw new Error(`Binance account fetch failed: ${accRes.status}`);
  const account = await accRes.json();

  const balances = (account.balances || []).filter(
    (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
  );
  const assets = balances.map((b: any) => b.asset as string);
  const quotes = ["USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "BTC", "ETH", "BNB"];

  const allTrades: NormalizedTrade[] = [];
  for (const asset of assets) {
    if (quotes.includes(asset)) continue;

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
  const maxHistory = 180 * 24 * 60 * 60 * 1000;
  const windowSize = 7 * 24 * 60 * 60 * 1000;

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
        const quoteList = ["USDT", "USDC", "USDD", "USDE", "BUSD", "BTC", "ETH", "EUR", "GBP", "USD", "DAI"];
        for (const q of quoteList) {
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
  const allTrades: NormalizedTrade[] = [];
  const lookbackMs = 90 * 24 * 60 * 60 * 1000;
  const beginMs = Date.now() - lookbackMs;
  let afterId = "";
  let hasMore = true;

  console.log(`[OKX] Starting sync...`);

  while (hasMore) {
    const ts = new Date().toISOString();
    const path = `/api/v5/trade/fills?instType=SPOT&limit=100&begin=${beginMs}${afterId ? `&after=${afterId}` : ""}`;
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
      throw new Error(`OKX trades failed: ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== "0") throw new Error(data.msg);

    const list = data.data || [];
    if (list.length > 0) {
      console.log(`[OKX] page trades: ${list.length}`);
    }

    for (const t of list) {
      const baseAsset = (t.instId || "").split("-")[0];
      allTrades.push({
        id: t.tradeId || t.billId || String(Date.now()),
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
  const windowSize = 30;
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
      let nextUri: string | null = `/v2/accounts/${acc.id}/${type}?limit=100`;

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
            id: t.id || String(Date.now()),
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
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSignBase64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function hmacSign512(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha512(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function krakenSign(path: string, postData: string, nonce: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const sha256Hash = await crypto.subtle.digest("SHA-256", encoder.encode(nonce + postData));
  const pathBytes = encoder.encode(path);
  const message = new Uint8Array(pathBytes.length + sha256Hash.byteLength);
  message.set(pathBytes, 0);
  message.set(new Uint8Array(sha256Hash), pathBytes.length);
  const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
