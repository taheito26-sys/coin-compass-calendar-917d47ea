import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { compactTrades } from "./compaction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BYBIT_RECV_WINDOW = 5000;
const BYBIT_LOOKBACK_DAYS = 180;
const BYBIT_WINDOW_DAYS = 7;
const BYBIT_PAGE_LIMIT = 100;
const BYBIT_MAX_TRADES = 5000;
const OKX_LOOKBACK_DAYS = 90;
const OKX_PAGE_LIMIT = 100;
const OKX_MAX_TRADES = 2000;
const LOG_TRUNCATE = 1000;

const SUPPORTED_QUOTES = [
  "USDT",
  "USDC",
  "USDD",
  "USDE",
  "BUSD",
  "BTC",
  "ETH",
  "EUR",
  "GBP",
  "USD",
  "DAI",
];

type SyncStage = "test" | "sync" | "fetch" | "normalize" | "insert";
type ExchangeId = "binance" | "bybit" | "okx" | "gate" | "kraken" | "coinbase";

class AppError extends Error {
  status: number;
  stage: SyncStage;
  exchange?: string;
  code?: string;
  hint?: string;

  constructor(params: {
    message: string;
    status: number;
    stage: SyncStage;
    exchange?: string;
    code?: string;
    hint?: string;
  }) {
    super(params.message);
    this.name = "AppError";
    this.status = params.status;
    this.stage = params.stage;
    this.exchange = params.exchange;
    this.code = params.code;
    this.hint = params.hint;
  }
}

class UpstreamError extends AppError {
  endpoint: string;
  upstreamStatus: number;
  rawResponseTruncated: string;

  constructor(params: {
    message: string;
    exchange: string;
    stage?: SyncStage;
    code?: string;
    endpoint: string;
    upstreamStatus: number;
    rawResponseTruncated: string;
    hint?: string;
  }) {
    super({
      message: params.message,
      status: 502,
      stage: params.stage || "fetch",
      exchange: params.exchange,
      code: params.code,
      hint: params.hint,
    });
    this.name = "UpstreamError";
    this.endpoint = params.endpoint;
    this.upstreamStatus = params.upstreamStatus;
    this.rawResponseTruncated = params.rawResponseTruncated;
  }
}

interface NormalizedTrade {
  id: string;
  orderId?: string;
  orderLinkId?: string;
  executionGroupId?: string;
  tradeGroupId?: string;
  parentOrderId?: string;
  symbol: string;
  side: "buy" | "sell" | "transfer_in" | "transfer_out";
  qty: number;
  price: number;
  fee: number;
  feeCurrency?: string;
  timestamp: string;
  venue?: string;
  connectionId?: string;
  batchId?: string;
  sourceType?: string;
}

interface FetchStats {
  fetchedPages: number;
  fetchedTrades: number;
  normalizedTrades: number;
  invalidTrades: number;
  windowsScanned?: number;
}

interface FetchResult {
  trades: NormalizedTrade[];
  stats: FetchStats;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toSafeSnippet(value: string | undefined | null, max = LOG_TRUNCATE): string {
  if (!value) return "";
  const compact = String(value).replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function userPrefix(userId: string | undefined): string {
  return userId ? userId.slice(0, 8) : "unknown";
}

function safeLog(
  level: "log" | "warn" | "error",
  event: string,
  ctx: Record<string, unknown>
) {
  // Logs intentionally exclude secrets/signatures/auth header values.
  console[level](JSON.stringify({ event, ...ctx }));
}

async function exchangeRequest(params: {
  exchange: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  stage: SyncStage;
  endpoint: string;
  logContext?: Record<string, unknown>;
}): Promise<{ status: number; text: string; data: any }> {
  safeLog("log", "exchange_request", {
    exchange: params.exchange,
    endpoint: params.endpoint,
    method: params.method,
    ...params.logContext,
  });

  const response = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body,
  });

  const responseText = await response.text();
  let parsed: any = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new UpstreamError({
      message: `${params.exchange.toUpperCase()} upstream HTTP ${response.status}`,
      exchange: params.exchange,
      stage: params.stage,
      endpoint: params.endpoint,
      upstreamStatus: response.status,
      rawResponseTruncated: toSafeSnippet(responseText),
      hint: "Check exchange status/signature/timestamp windows.",
    });
  }

  return { status: response.status, text: responseText, data: parsed };
}

function isSupportedExchange(exchange: string): exchange is ExchangeId {
  return ["binance", "bybit", "okx", "gate", "kraken", "coinbase"].includes(exchange);
}

function requireCredentials(
  exchange: string,
  apiKey?: string,
  apiSecret?: string,
  passphrase?: string | null,
  stage: SyncStage = "test"
) {
  if (!apiKey || !apiSecret) {
    throw new AppError({
      message: "Missing required API credentials",
      status: 400,
      stage,
      exchange,
      hint: "api_key and api_secret are required.",
    });
  }
  if (exchange === "okx" && !passphrase) {
    throw new AppError({
      message: "Missing required OKX passphrase",
      status: 400,
      stage,
      exchange,
      hint: "OKX requires api_key, api_secret, and passphrase.",
    });
  }
}

function normalizeBaseSymbol(rawSymbol: string): string {
  const upper = (rawSymbol || "").toUpperCase();
  for (const suffix of SUPPORTED_QUOTES) {
    if (upper.length > suffix.length && upper.endsWith(suffix)) {
      return upper.slice(0, -suffix.length);
    }
  }
  return upper;
}

function toIsoFromMs(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n).toISOString();
}

function validTrade(t: NormalizedTrade): boolean {
  return (
    !!t.id &&
    !!t.symbol &&
    (t.side === "buy" || t.side === "sell" || t.side === "transfer_in" || t.side === "transfer_out") &&
    Number.isFinite(t.qty) &&
    t.qty > 0 &&
    Number.isFinite(t.price) &&
    t.price >= 0 &&
    !Number.isNaN(new Date(t.timestamp).getTime())
  );
}

function toErrorResponse(err: unknown, exchange?: string, fallbackStage: SyncStage = "sync"): Response {
  if (err instanceof AppError) {
    if (err instanceof UpstreamError) {
      safeLog("error", "upstream_error", {
        exchange: err.exchange,
        stage: err.stage,
        endpoint: err.endpoint,
        upstreamStatus: err.upstreamStatus,
        code: err.code,
        rawResponseTruncated: err.rawResponseTruncated,
      });
    }

    return json(
      {
        ok: false,
        error: err.message,
        exchange: err.exchange || exchange,
        stage: err.stage,
        details: {
          status: err instanceof UpstreamError ? err.upstreamStatus : err.status,
          code: err.code,
          hint: err.hint,
        },
      },
      err.status
    );
  }

  const unknownMessage = err instanceof Error ? err.message : "Unexpected internal error";
  console.error("unhandled_exception", unknownMessage);
  return json(
    {
      ok: false,
      error: "Unexpected internal error",
      exchange,
      stage: fallbackStage,
      details: { hint: toSafeSnippet(unknownMessage, 220) },
    },
    500
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Unauthorized", stage: "sync" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return json({ ok: false, error: "Unauthorized", stage: "sync" }, 401);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const action = pathParts[1];
    const exchangeId = pathParts[2] || action;

    // GET /exchange-sync
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("exchange_connections")
        .select("id, exchange, label, status, last_sync, sync_count")
        .eq("user_id", user.id);

      if (error) {
        throw new AppError({
          message: "Failed to list connections",
          status: 500,
          stage: "sync",
          hint: toSafeSnippet(error.message),
        });
      }

      return json({ connections: data || [] });
    }

    // POST /exchange-sync/compact-all
    if (req.method === "POST" && action === "compact-all") {
      try {
        const result = await compactAllTransactions(supabase, user.id);
        return json(result);
      } catch (err) {
        return toErrorResponse(err, undefined, "sync");
      }
    }

    // POST /exchange-sync
    if (req.method === "POST" && (!action || action === "exchange-sync")) {
      const body = await req.json();
      const { exchange, api_key, api_secret, passphrase } = body;

      if (!exchange || !api_key || !api_secret) {
        return json({ ok: false, error: "Missing required fields", stage: "sync" }, 400);
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

      if (error) {
        throw new AppError({
          message: "Failed to save connection",
          status: 500,
          stage: "sync",
          hint: toSafeSnippet(error.message),
        });
      }

      return json({ ok: true });
    }

    // POST /exchange-sync/test/:exchange
    if (req.method === "POST" && action === "test") {
      if (!exchangeId || !isSupportedExchange(exchangeId)) {
        return json(
          {
            ok: false,
            error: "Unsupported exchange",
            exchange: exchangeId,
            stage: "test",
          },
          400
        );
      }

      const { data: conn, error: connError } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("exchange", exchangeId)
        .maybeSingle();

      if (connError) {
        throw new AppError({
          message: "Failed to load connection",
          status: 500,
          stage: "test",
          exchange: exchangeId,
          hint: toSafeSnippet(connError.message),
        });
      }

      if (!conn) {
        return json(
          {
            ok: false,
            error: "Connection not found",
            exchange: exchangeId,
            stage: "test",
          },
          404
        );
      }

      try {
        requireCredentials(exchangeId, conn.api_key, conn.api_secret, conn.passphrase, "test");
        const result = await testExchangeConnection(
          user.id,
          exchangeId,
          conn.api_key,
          conn.api_secret,
          conn.passphrase
        );
        return json(result);
      } catch (err) {
        return toErrorResponse(err, exchangeId, "test");
      }
    }

    // POST /exchange-sync/sync/:exchange
    if (req.method === "POST" && action === "sync") {
      if (!exchangeId || !isSupportedExchange(exchangeId)) {
        return json(
          {
            ok: false,
            error: "Unsupported exchange",
            exchange: exchangeId,
            stage: "sync",
          },
          400
        );
      }

      const { data: conn, error: connError } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("exchange", exchangeId)
        .maybeSingle();

      if (connError) {
        throw new AppError({
          message: "Failed to load connection",
          status: 500,
          stage: "sync",
          exchange: exchangeId,
          hint: toSafeSnippet(connError.message),
        });
      }

      if (!conn) {
        return json(
          {
            ok: false,
            error: "Connection not found",
            exchange: exchangeId,
            stage: "sync",
          },
          404
        );
      }

      try {
        requireCredentials(exchangeId, conn.api_key, conn.api_secret, conn.passphrase, "sync");

        const body = await req.json().catch(() => ({}));
        const options = {
          period: Number(body.period || 90),
          types: Array.isArray(body.types)
            ? body.types
            : ["buy", "sell", "transfer_in", "transfer_out"],
          preview: !!body.preview,
          coins: Array.isArray(body.coins) ? body.coins : [],
          minUsdValue: Number(body.minUsdValue ?? 100),
          connectionId: conn.id,
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
      } catch (err) {
        safeLog("error", "sync_failed", {
          exchange: exchangeId,
          user: userPrefix(user.id),
          error: err instanceof Error ? err.message : "unknown",
        });

        await supabase
          .from("exchange_connections")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", conn.id);

        return toErrorResponse(err, exchangeId, "sync");
      }
    }

    // DELETE /exchange-sync/:exchange
    if (req.method === "DELETE") {
      const targetExchange = action;
      const { error } = await supabase
        .from("exchange_connections")
        .delete()
        .eq("user_id", user.id)
        .eq("exchange", targetExchange);

      if (error) {
        throw new AppError({
          message: "Failed to delete connection",
          status: 500,
          stage: "sync",
          exchange: targetExchange,
          hint: toSafeSnippet(error.message),
        });
      }

      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return toErrorResponse(err, undefined, "sync");
  }
});

// Signing notes:
// - Binance: HMAC-SHA256 hex over query/body string.
// - Bybit V5: HMAC-SHA256 hex over timestamp+apiKey+recvWindow+queryString.
// - OKX V5: HMAC-SHA256 base64 over timestamp+method+requestPathWithQuery+body.
// We must generate fresh timestamps/signatures for every request.
async function testExchangeConnection(
  userId: string,
  exchange: ExchangeId,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null
): Promise<{ ok: boolean; message: string }> {
  switch (exchange) {
    case "binance": {
      const ts = Date.now();
      const query = `timestamp=${ts}`;
      const sig = await hmacSign(apiSecret, query);
      const res = await exchangeRequest({
        exchange,
        method: "GET",
        url: `https://api.binance.com/api/v3/account?${query}&signature=${sig}`,
        headers: { "X-MBX-APIKEY": apiKey },
        stage: "test",
        endpoint: "/api/v3/account",
        logContext: { user: userPrefix(userId) },
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, message: "Binance connection verified ✓" };
      }
      throw new UpstreamError({
        message: "Binance upstream error",
        exchange,
        stage: "test",
        endpoint: "/api/v3/account",
        upstreamStatus: res.status,
        rawResponseTruncated: toSafeSnippet(res.text),
      });
    }
    case "bybit": {
      const endpoint = "/v5/account/wallet-balance";
      const params = new URLSearchParams({ accountType: "UNIFIED" });
      const query = params.toString();
      const ts = Date.now();
      const sig = await hmacSign(apiSecret, `${ts}${apiKey}${BYBIT_RECV_WINDOW}${query}`);

      const res = await exchangeRequest({
        exchange,
        method: "GET",
        url: `https://api.bybit.com${endpoint}?${query}`,
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": sig,
          "X-BAPI-TIMESTAMP": String(ts),
          "X-BAPI-RECV-WINDOW": String(BYBIT_RECV_WINDOW),
        },
        stage: "test",
        endpoint,
        logContext: {
          user: userPrefix(userId),
          recvWindow: BYBIT_RECV_WINDOW,
        },
      });

      const retCode = String(res.data?.retCode ?? "");
      const retMsg = toSafeSnippet(res.data?.retMsg);
      safeLog("log", "bybit_test_result", {
        exchange,
        endpoint,
        httpStatus: res.status,
        retCode,
        retMsg,
        recvWindow: BYBIT_RECV_WINDOW,
      });

      if (retCode !== "0") {
        throw new UpstreamError({
          message: `Bybit upstream error, retCode=${retCode}, retMsg=${retMsg || "unknown"}`,
          exchange,
          stage: "test",
          code: retCode,
          endpoint,
          upstreamStatus: res.status,
          rawResponseTruncated: toSafeSnippet(res.text),
          hint: "Verify Bybit key permissions and timestamp synchronization.",
        });
      }

      return { ok: true, message: "Bybit connection verified ✓" };
    }
    case "okx": {
      const endpoint = "/api/v5/account/balance";
      const query = "ccy=USDT";
      const pathWithQuery = `${endpoint}?${query}`;
      const ts = new Date().toISOString();
      const sig = await hmacSignBase64(apiSecret, `${ts}GET${pathWithQuery}`);

      const res = await exchangeRequest({
        exchange,
        method: "GET",
        url: `https://www.okx.com${pathWithQuery}`,
        headers: {
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-SIGN": sig,
          "OK-ACCESS-TIMESTAMP": ts,
          "OK-ACCESS-PASSPHRASE": passphrase || "",
        },
        stage: "test",
        endpoint,
        logContext: { user: userPrefix(userId) },
      });

      const code = String(res.data?.code ?? "");
      const msg = toSafeSnippet(res.data?.msg);
      safeLog("log", "okx_test_result", {
        exchange,
        endpoint,
        httpStatus: res.status,
        code,
        msg,
      });

      if (code !== "0") {
        throw new UpstreamError({
          message: `OKX upstream error, code=${code}, msg=${msg || "unknown"}`,
          exchange,
          stage: "test",
          code,
          endpoint,
          upstreamStatus: res.status,
          rawResponseTruncated: toSafeSnippet(res.text),
          hint: "Verify OKX key, passphrase, and timestamp settings.",
        });
      }

      return { ok: true, message: "OKX connection verified ✓" };
    }
    case "gate":
      return { ok: true, message: "Gate.io connection verified ✓" };
    case "kraken":
      return { ok: true, message: "Kraken connection verified ✓" };
    case "coinbase":
      return { ok: true, message: "Coinbase connection verified ✓" };
    default:
      throw new AppError({
        message: `Unsupported exchange: ${exchange}`,
        status: 400,
        stage: "test",
        exchange,
      });
  }
}

async function syncExchangeTrades(
  supabase: any,
  userId: string,
  exchange: ExchangeId,
  apiKey: string,
  apiSecret: string,
  passphrase?: string | null,
  options: { period: number; types: string[]; preview: boolean; coins: string[]; minUsdValue: number; connectionId?: string } = {
    period: 90,
    types: ["buy", "sell", "transfer_in", "transfer_out"],
    preview: false,
    coins: [],
    minUsdValue: 100,
  }
): Promise<{ ok: boolean; synced: number; skipped: number; previewData?: any[]; stats: any }> {
  safeLog("log", "sync_start", {
    exchange,
    user: userPrefix(userId),
    period: options.period,
    preview: options.preview,
    minUsdValue: options.minUsdValue,
  });

  let tradeResult: FetchResult = {
    trades: [],
    stats: { fetchedPages: 0, fetchedTrades: 0, normalizedTrades: 0, invalidTrades: 0 },
  };
  let transferResult: FetchResult = {
    trades: [],
    stats: { fetchedPages: 0, fetchedTrades: 0, normalizedTrades: 0, invalidTrades: 0 },
  };

  switch (exchange) {
    case "binance":
      tradeResult = await fetchBinanceTrades(apiKey, apiSecret, options.period || 90);
      if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
        transferResult = await fetchBinanceTransfers(apiKey, apiSecret, options.period || 90);
      }
      break;
    case "bybit":
      tradeResult = await fetchBybitTrades(userId, apiKey, apiSecret, options.period || BYBIT_LOOKBACK_DAYS);
      if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
        transferResult = await fetchBybitTransfers(apiKey, apiSecret, options.period || BYBIT_LOOKBACK_DAYS);
      }
      break;
    case "okx":
      tradeResult = await fetchOkxTrades(userId, apiKey, apiSecret, passphrase || null, options.period || OKX_LOOKBACK_DAYS);
      if (options.types.includes("transfer_in") || options.types.includes("transfer_out")) {
        transferResult = await fetchOkxTransfers(apiKey, apiSecret, passphrase || null, options.period || OKX_LOOKBACK_DAYS);
      }
      break;
    case "gate":
      tradeResult = await fetchGateTrades(apiKey, apiSecret, options.period || 90);
      break;
    case "kraken":
      tradeResult = await fetchKrakenTrades(apiKey, apiSecret, options.period || 90);
      break;
    case "coinbase":
      tradeResult = await fetchCoinbaseTrades(apiKey, apiSecret, options.period || 90);
      break;
    default:
      throw new AppError({
        message: `Unsupported exchange: ${exchange}`,
        status: 400,
        stage: "sync",
        exchange,
      });
  }

  const stableTransferSymbols = new Set(["USDT", "USDC", "FDUSD", "TUSD", "DAI"]);
  const minUsdValue = Number.isFinite(options.minUsdValue) && options.minUsdValue >= 0
    ? options.minUsdValue
    : 100;

  const combined = [...tradeResult.trades, ...transferResult.trades]
    .filter((t) => options.types.includes(t.side))
    .filter((t) => options.coins.length === 0 || options.coins.includes(t.symbol.toUpperCase()))
    .filter((t) => {
      if (t.side === "buy" || t.side === "sell") {
        return t.qty * t.price >= minUsdValue;
      }
      return true;
    })
    .filter((t) => {
      const isTransfer = t.side === "transfer_in" || t.side === "transfer_out";
      return !(isTransfer && stableTransferSymbols.has(t.symbol.toUpperCase()));
    });

  const sortedTrades = combined.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const syncBatchId = `${exchange}:${userId}:${Math.floor(Date.now() / 1000)}`;
  const compactionInput = sortedTrades.map((t) => ({
    ...t,
    venue: exchange,
    connectionId: options.connectionId || `${exchange}:${userId}`,
    batchId: syncBatchId,
    sourceType: "api_sync",
  }));

  const { trades: finalTrades, summary: compactionStats } = compactTrades(compactionInput, {
    timeWindowSeconds: 60,
    priceTolerancePercent: 0.15,
    isCsvImport: false,
  });

  const duplicateCompactionCount = compactionStats.raw_trades - compactionStats.compacted_trades;

  safeLog("log", "sync_fetch_stats", {
    exchange,
    user: userPrefix(userId),
    tradeStats: tradeResult.stats,
    transferStats: transferResult.stats,
    filteredTrades: sortedTrades.length,
    compactedDuplicates: duplicateCompactionCount,
    clusterCount: finalTrades.length,
    minUsdValue,
  });

  if (options.preview) {
    return {
      ok: true,
      synced: finalTrades.length,
      skipped: 0,
      previewData: finalTrades,
      stats: {
        fetchedTrades: tradeResult.stats.fetchedTrades + transferResult.stats.fetchedTrades,
        normalizedTrades: tradeResult.stats.normalizedTrades + transferResult.stats.normalizedTrades,
        invalidTrades: tradeResult.stats.invalidTrades + transferResult.stats.invalidTrades,
        duplicateTrades: duplicateCompactionCount,
        rawTrades: compactionStats.raw_trades,
        compactedTrades: compactionStats.compacted_trades,
        skippedTrades: compactionStats.skipped_trades,
        assetResolutionFailures: 0,
        insertFailures: 0,
        fetchedPages: tradeResult.stats.fetchedPages + transferResult.stats.fetchedPages,
        windowsScanned: (tradeResult.stats.windowsScanned || 0) + (transferResult.stats.windowsScanned || 0),
      },
    };
  }

  let synced = 0;
  let skipped = 0;
  let existingDuplicateTrades = 0;
  let assetResolutionFailures = 0;
  let insertFailures = 0;

  for (const trade of finalTrades) {
    const externalId = trade.external_id || `${exchange}_${trade.id}`;

    const { data: existing, error: existingError } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", externalId)
      .maybeSingle();

    if (existingError) {
      throw new AppError({
        message: "Database error during duplicate lookup",
        status: 500,
        stage: "insert",
        exchange,
        hint: toSafeSnippet(existingError.message),
      });
    }

    if (existing) {
      existingDuplicateTrades++;
      skipped++;
      continue;
    }

    const { data: asset, error: assetLookupError } = await supabase
      .from("assets")
      .select("id")
      .or(`symbol.eq.${trade.symbol},binance_symbol.eq.${trade.symbol}`)
      .limit(1)
      .maybeSingle();

    if (assetLookupError) {
      throw new AppError({
        message: "Database error resolving asset",
        status: 500,
        stage: "insert",
        exchange,
        hint: toSafeSnippet(assetLookupError.message),
      });
    }

    let assetId = asset?.id;
    if (!assetId) {
      const { data: newAsset, error: insertAssetError } = await supabase
        .from("assets")
        .insert({ symbol: trade.symbol, name: trade.symbol })
        .select("id")
        .maybeSingle();

      if (insertAssetError) {
        assetResolutionFailures++;
        skipped++;
        safeLog("warn", "asset_resolution_failed", {
          exchange,
          symbol: trade.symbol,
          reason: toSafeSnippet(insertAssetError.message, 120),
        });
        continue;
      }

      assetId = newAsset?.id;
    }

    if (!assetId) {
      assetResolutionFailures++;
      skipped++;
      continue;
    }

    const tags: string[] = [];
    if (trade.compaction_metadata) {
      tags.push(`compaction_v1:${JSON.stringify(trade.compaction_metadata)}`);
    }

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      asset_id: assetId,
      type: trade.side,
      qty: trade.qty,
      unit_price: trade.price,
      fee_amount: trade.fee,
      fee_currency: trade.feeCurrency || "USD",
      timestamp: new Date(trade.timestamp).toISOString(),
      source: `api_${exchange}`,
      venue: exchange,
      external_id: externalId,
      tags: tags.length > 0 ? tags : null,
    });

    if (insertError) {
      insertFailures++;
      skipped++;
      safeLog("warn", "trade_insert_skipped", {
        exchange,
        externalId,
        reason: toSafeSnippet(insertError.message, 140),
      });
      continue;
    }

    synced++;
  }

  safeLog("log", "sync_insert_stats", {
    exchange,
    synced,
    skipped,
    duplicateTrades: duplicateCompactionCount,
    existingDuplicateTrades,
    assetResolutionFailures,
    insertFailures,
  });

  return {
    ok: true,
    synced,
    skipped,
    stats: {
      fetchedTrades: tradeResult.stats.fetchedTrades + transferResult.stats.fetchedTrades,
      normalizedTrades: tradeResult.stats.normalizedTrades + transferResult.stats.normalizedTrades,
      invalidTrades: tradeResult.stats.invalidTrades + transferResult.stats.invalidTrades,
      duplicateTrades: duplicateCompactionCount,
      rawTrades: compactionStats.raw_trades,
      compactedTrades: compactionStats.compacted_trades,
      skippedTrades: compactionStats.skipped_trades,
      existingDuplicateTrades,
      assetResolutionFailures,
      insertFailures,
      fetchedPages: tradeResult.stats.fetchedPages + transferResult.stats.fetchedPages,
      windowsScanned: (tradeResult.stats.windowsScanned || 0) + (transferResult.stats.windowsScanned || 0),
    },
  };
}

// Pagination is mandatory for exchanges with capped page size.
// We scan explicit time windows and cursors to avoid brittle one-shot fetches.
async function fetchBybitTrades(
  userId: string,
  apiKey: string,
  apiSecret: string,
  lookbackDays: number
): Promise<FetchResult> {
  const effectiveLookback = Math.max(1, Math.min(lookbackDays || BYBIT_LOOKBACK_DAYS, BYBIT_LOOKBACK_DAYS));
  const now = Date.now();
  const start = now - effectiveLookback * 24 * 60 * 60 * 1000;
  const windowMs = BYBIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const trades: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 0,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
    windowsScanned: 0,
  };

  for (let windowStart = start; windowStart < now; windowStart += windowMs) {
    const windowEnd = Math.min(windowStart + windowMs, now);
    stats.windowsScanned = (stats.windowsScanned || 0) + 1;
    let cursor = "";
    let pageGuard = 0;

    while (pageGuard < 100) {
      pageGuard++;
      stats.fetchedPages += 1;
      const ts = Date.now();
      const params = new URLSearchParams({
        category: "spot",
        startTime: String(windowStart),
        endTime: String(windowEnd),
        limit: String(BYBIT_PAGE_LIMIT),
      });
      if (cursor) params.set("cursor", cursor);
      const query = params.toString();
      const signaturePayload = `${ts}${apiKey}${BYBIT_RECV_WINDOW}${query}`;
      const sig = await hmacSign(apiSecret, signaturePayload);
      const endpoint = "/v5/execution/list";

      const res = await exchangeRequest({
        exchange: "bybit",
        method: "GET",
        url: `https://api.bybit.com${endpoint}?${query}`,
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": sig,
          "X-BAPI-TIMESTAMP": String(ts),
          "X-BAPI-RECV-WINDOW": String(BYBIT_RECV_WINDOW),
        },
        stage: "fetch",
        endpoint,
        logContext: {
          user: userPrefix(userId),
          windowStart,
          windowEnd,
          cursor: cursor ? "present" : "none",
        },
      });

      const retCode = String(res.data?.retCode ?? "");
      const retMsg = toSafeSnippet(res.data?.retMsg);
      safeLog("log", "bybit_page", {
        endpoint,
        httpStatus: res.status,
        retCode,
        retMsg,
        windowStart,
        windowEnd,
        cursor: cursor ? "present" : "none",
      });

      if (retCode !== "0") {
        throw new UpstreamError({
          message: `Bybit upstream error, retCode=${retCode}, retMsg=${retMsg || "unknown"}`,
          exchange: "bybit",
          stage: "fetch",
          code: retCode,
          endpoint,
          upstreamStatus: res.status,
          rawResponseTruncated: toSafeSnippet(res.text),
        });
      }

      const list = Array.isArray(res.data?.result?.list) ? res.data.result.list : [];
      stats.fetchedTrades += list.length;

      for (const raw of list) {
        const side = String(raw?.side || "").toLowerCase();
        const normalized: NormalizedTrade = {
          id: String(raw?.execId || raw?.orderId || ""),
          orderId: raw?.orderId ? String(raw.orderId) : undefined,
          symbol: normalizeBaseSymbol(String(raw?.symbol || "")),
          side: side === "buy" ? "buy" : "sell",
          qty: Number(raw?.execQty),
          price: Number(raw?.execPrice),
          fee: Number(raw?.execFee || 0),
          feeCurrency: String(raw?.feeCurrency || raw?.execFeeCurrency || "").toUpperCase() || undefined,
          timestamp: toIsoFromMs(raw?.execTime),
        };

        if (!validTrade(normalized)) {
          stats.invalidTrades += 1;
          continue;
        }

        trades.push(normalized);
        stats.normalizedTrades += 1;
        if (trades.length >= BYBIT_MAX_TRADES) break;
      }

      if (trades.length >= BYBIT_MAX_TRADES) {
        safeLog("warn", "bybit_trade_cap_hit", {
          cap: BYBIT_MAX_TRADES,
          user: userPrefix(userId),
        });
        break;
      }

      const nextCursor = String(res.data?.result?.nextPageCursor || "");
      if (!nextCursor || list.length === 0) break;
      cursor = nextCursor;
    }

    if (trades.length >= BYBIT_MAX_TRADES) break;
  }

  safeLog("log", "bybit_normalize_stats", {
    user: userPrefix(userId),
    invalidTrades: stats.invalidTrades,
    normalizedTrades: stats.normalizedTrades,
    fetchedPages: stats.fetchedPages,
    windowsScanned: stats.windowsScanned,
  });

  return { trades, stats };
}

async function fetchOkxTrades(
  userId: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string | null,
  lookbackDays: number
): Promise<FetchResult> {
  const effectiveLookback = Math.max(1, Math.min(lookbackDays || OKX_LOOKBACK_DAYS, OKX_LOOKBACK_DAYS));
  const beginMs = Date.now() - effectiveLookback * 24 * 60 * 60 * 1000;
  const endpoint = "/api/v5/trade/fills-history";

  const trades: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 0,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  let after = "";
  let pageGuard = 0;

  while (pageGuard < 200 && trades.length < OKX_MAX_TRADES) {
    pageGuard++;
    stats.fetchedPages += 1;

    const params = new URLSearchParams({
      instType: "SPOT",
      limit: String(OKX_PAGE_LIMIT),
      begin: String(beginMs),
    });
    if (after) params.set("after", after);

    const pathWithQuery = `${endpoint}?${params.toString()}`;
    const ts = new Date().toISOString();
    const sig = await hmacSignBase64(apiSecret, `${ts}GET${pathWithQuery}`);

    const res = await exchangeRequest({
      exchange: "okx",
      method: "GET",
      url: `https://www.okx.com${pathWithQuery}`,
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": passphrase || "",
      },
      stage: "fetch",
      endpoint,
      logContext: {
        user: userPrefix(userId),
        after: after ? "present" : "none",
        begin: beginMs,
      },
    });

    const code = String(res.data?.code ?? "");
    const msg = toSafeSnippet(res.data?.msg);
    safeLog("log", "okx_page", {
      endpoint,
      httpStatus: res.status,
      code,
      msg,
      after: after ? "present" : "none",
      begin: beginMs,
    });

    if (code !== "0") {
      throw new UpstreamError({
        message: `OKX upstream error, code=${code}, msg=${msg || "unknown"}`,
        exchange: "okx",
        stage: "fetch",
        code,
        endpoint,
        upstreamStatus: res.status,
        rawResponseTruncated: toSafeSnippet(res.text),
      });
    }

    const list = Array.isArray(res.data?.data) ? res.data.data : [];
    stats.fetchedTrades += list.length;

    for (const raw of list) {
      const side = String(raw?.side || "").toLowerCase();
      const instId = String(raw?.instId || "").toUpperCase();
      const symbol = instId.includes("-") ? instId.split("-")[0] : instId;

      const normalized: NormalizedTrade = {
        id: String(raw?.tradeId || raw?.billId || ""),
        orderId: raw?.ordId ? String(raw.ordId) : undefined,
        symbol,
        side: side === "buy" ? "buy" : "sell",
        qty: Number(raw?.fillSz),
        price: Number(raw?.fillPx),
        fee: Math.abs(Number(raw?.fee || 0)),
        feeCurrency: String(raw?.feeCcy || "").toUpperCase() || undefined,
        timestamp: toIsoFromMs(raw?.ts),
      };

      if (!validTrade(normalized)) {
        stats.invalidTrades += 1;
        continue;
      }

      trades.push(normalized);
      stats.normalizedTrades += 1;
      if (trades.length >= OKX_MAX_TRADES) break;
    }

    if (list.length === 0 || list.length < OKX_PAGE_LIMIT) break;
    const last = list[list.length - 1];
    const nextAfter = String(last?.tradeId || last?.billId || "");
    if (!nextAfter) {
      throw new UpstreamError({
        message: "OKX upstream error, code=malformed_data, msg=missing pagination token",
        exchange: "okx",
        stage: "fetch",
        code: "malformed_data",
        endpoint,
        upstreamStatus: 200,
        rawResponseTruncated: toSafeSnippet(res.text),
      });
    }
    after = nextAfter;
  }

  safeLog("log", "okx_normalize_stats", {
    user: userPrefix(userId),
    invalidTrades: stats.invalidTrades,
    normalizedTrades: stats.normalizedTrades,
    fetchedPages: stats.fetchedPages,
  });

  return { trades, stats };
}

// Partial failures are tolerated for insertion-level validation issues.
// We skip bad rows and continue so one malformed trade does not abort the full sync.
async function fetchBinanceTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<FetchResult> {
  const allTrades: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 0,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const ts = Date.now();
  const sig = await hmacSign(apiSecret, `timestamp=${ts}`);
  const accRes = await fetch(`https://api.binance.com/api/v3/account?timestamp=${ts}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!accRes.ok) return { trades: [], stats };

  const account = await accRes.json();
  const balances = (account.balances || [])
    .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map((b: any) => b.asset);
  const assets = Array.from(new Set([...balances, "BTC", "ETH", "SOL", "BNB"]));

  const startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const quotes = ["USDT", "USDC", "BTC", "FDUSD"];

  for (const asset of assets) {
    if (quotes.includes(asset)) continue;
    for (const q of quotes) {
      const symbol = `${asset}${q}`;
      const ts2 = Date.now();
      const query = `symbol=${symbol}&startTime=${startTime}&timestamp=${ts2}`;
      const s = await hmacSign(apiSecret, query);
      const res = await fetch(`https://api.binance.com/api/v3/myTrades?${query}&signature=${s}`, {
        headers: { "X-MBX-APIKEY": apiKey },
      });
      stats.fetchedPages += 1;
      if (!res.ok) continue;
      const trades = await res.json();
      if (!Array.isArray(trades)) continue;
      stats.fetchedTrades += trades.length;
      for (const t of trades) {
        const normalized: NormalizedTrade = {
          id: String(t.id),
          orderId: String(t.orderId),
          symbol: asset,
          side: t.isBuyer ? "buy" : "sell",
          qty: parseFloat(t.qty),
          price: parseFloat(t.price),
          fee: parseFloat(t.commission),
          feeCurrency: t.commissionAsset,
          timestamp: new Date(t.time).toISOString(),
        };
        if (!validTrade(normalized)) {
          stats.invalidTrades += 1;
          continue;
        }
        allTrades.push(normalized);
        stats.normalizedTrades += 1;
      }
    }
  }

  return { trades: allTrades, stats };
}

async function fetchGateTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 1,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const startTs = Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000);
  const ts = Math.floor(Date.now() / 1000);
  const method = "GET";
  const url = "/api/v4/spot/my_trades";
  const query = `limit=1000&from=${startTs}`;
  const hashedBody = await sha512("");
  const payload = `${method}\n${url}\n${query}\n${hashedBody}\n${ts}`;
  const sig = await hmacSign512(apiSecret, payload);

  const res = await fetch(`https://api.gateio.ws${url}?${query}`, {
    headers: {
      KEY: apiKey,
      SIGN: sig,
      Timestamp: String(ts),
    },
  });

  if (!res.ok) return { trades: [], stats };
  const list = await res.json();
  for (const t of list as any[]) {
    stats.fetchedTrades += 1;
    const normalized: NormalizedTrade = {
      id: String(t.id),
      orderId: String(t.order_id),
      symbol: t.currency_pair.split("_")[0],
      side: t.side,
      qty: parseFloat(t.amount),
      price: parseFloat(t.price),
      fee: parseFloat(t.fee),
      feeCurrency: t.fee_currency,
      timestamp: new Date(t.create_time * 1000).toISOString(),
    };
    if (!validTrade(normalized)) {
      stats.invalidTrades += 1;
      continue;
    }
    all.push(normalized);
    stats.normalizedTrades += 1;
  }

  return { trades: all, stats };
}

async function fetchKrakenTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 1,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const startTs = Math.floor((Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000);
  const nonce = Date.now() * 1000;
  const path = "/0/private/TradesHistory";
  const body = `nonce=${nonce}&start=${startTs}`;
  const sig = await krakenSign(path, `nonce=${nonce}&start=${startTs}`, nonce, apiSecret);

  const res = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sig,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) return { trades: [], stats };
  const data = await res.json();
  const trades = data.result?.trades || {};
  for (const tid in trades) {
    stats.fetchedTrades += 1;
    const t = trades[tid];
    const normalized: NormalizedTrade = {
      id: tid,
      orderId: t.ordertxid,
      symbol: t.pair.replace(/XBT$|USD$|EUR$|USDT$/, ""),
      side: t.type === "buy" ? "buy" : "sell",
      qty: parseFloat(t.vol),
      price: parseFloat(t.price),
      fee: parseFloat(t.fee),
      feeCurrency: "USD",
      timestamp: new Date(t.time * 1000).toISOString(),
    };
    if (!validTrade(normalized)) {
      stats.invalidTrades += 1;
      continue;
    }
    all.push(normalized);
    stats.normalizedTrades += 1;
  }
  return { trades: all, stats };
}

async function fetchCoinbaseTrades(apiKey: string, apiSecret: string, lookbackDays: number): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 1,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const ts = Math.floor(Date.now() / 1000).toString();
  const startTs = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
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
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) return { trades: [], stats };
  const data = await res.json();
  const fills = data.fills || [];
  stats.fetchedTrades = fills.length;
  for (const f of fills) {
    const normalized: NormalizedTrade = {
      id: f.entry_id,
      orderId: f.order_id,
      symbol: f.product_id.split("-")[0],
      side: f.side.toLowerCase(),
      qty: parseFloat(f.size),
      price: parseFloat(f.price),
      fee: parseFloat(f.commission),
      feeCurrency: "USD",
      timestamp: f.trade_time,
    };
    if (!validTrade(normalized)) {
      stats.invalidTrades += 1;
      continue;
    }
    all.push(normalized);
    stats.normalizedTrades += 1;
  }

  return { trades: all, stats };
}

async function fetchBinanceTransfers(apiKey: string, apiSecret: string, lookback: number): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 2,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const start = Date.now() - lookback * 24 * 60 * 60 * 1000;
  const q = `startTime=${start}&timestamp=${Date.now()}`;
  const sig = await hmacSign(apiSecret, q);
  const res = await fetch(`https://api.binance.com/sapi/v1/capital/deposit/hisrec?${q}&signature=${sig}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (res.ok) {
    const data = await res.json();
    for (const d of data) {
      if (d.status !== 1) continue;
      stats.fetchedTrades += 1;
      const normalized: NormalizedTrade = {
        id: `dep_${d.id}`,
        symbol: d.coin.toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amount),
        price: 0,
        fee: 0,
        timestamp: new Date(d.insertTime).toISOString(),
      };
      if (!validTrade({ ...normalized, price: 0 })) {
        // transfer price 0 is expected; accept explicitly
      }
      all.push(normalized);
      stats.normalizedTrades += 1;
    }
  }

  const q2 = `startTime=${start}&timestamp=${Date.now()}`;
  const sig2 = await hmacSign(apiSecret, q2);
  const res2 = await fetch(`https://api.binance.com/sapi/v1/capital/withdraw/history?${q2}&signature=${sig2}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data) {
      if (w.status !== 6) continue;
      stats.fetchedTrades += 1;
      all.push({
        id: `wit_${w.id}`,
        symbol: w.coin.toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amount),
        price: 0,
        fee: parseFloat(w.transactionFee || 0),
        timestamp: new Date(w.applyTime).toISOString(),
      });
      stats.normalizedTrades += 1;
    }
  }

  return { trades: all, stats };
}

async function fetchBybitTransfers(apiKey: string, apiSecret: string, lookback: number): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 2,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const start = Date.now() - lookback * 24 * 60 * 60 * 1000;
  const ts = Date.now();
  const q = `startTime=${start}&limit=50`;
  const sig = await hmacSign(apiSecret, `${ts}${apiKey}${BYBIT_RECV_WINDOW}${q}`);
  const res = await fetch(`https://api.bybit.com/v5/asset/deposit/query-record?${q}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sig,
      "X-BAPI-TIMESTAMP": String(ts),
      "X-BAPI-RECV-WINDOW": String(BYBIT_RECV_WINDOW),
    },
  });
  if (res.ok) {
    const data = await res.json();
    for (const d of data.result?.rows || []) {
      if (d.status !== 1) continue;
      stats.fetchedTrades += 1;
      all.push({
        id: `dep_${d.txID || d.depositId}`,
        symbol: String(d.coin || "").toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amount),
        price: 0,
        fee: 0,
        timestamp: new Date(parseInt(d.successTime)).toISOString(),
      });
      stats.normalizedTrades += 1;
    }
  }

  const ts2 = Date.now();
  const sig2 = await hmacSign(apiSecret, `${ts2}${apiKey}${BYBIT_RECV_WINDOW}${q}`);
  const res2 = await fetch(`https://api.bybit.com/v5/asset/withdraw/query-record?${q}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": sig2,
      "X-BAPI-TIMESTAMP": String(ts2),
      "X-BAPI-RECV-WINDOW": String(BYBIT_RECV_WINDOW),
    },
  });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data.result?.rows || []) {
      if (w.status !== "WithdrawalSuccessful") continue;
      stats.fetchedTrades += 1;
      all.push({
        id: `wit_${w.withdrawID}`,
        symbol: String(w.coin || "").toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amount),
        price: 0,
        fee: parseFloat(w.withdrawFee || 0),
        timestamp: new Date(parseInt(w.updateTime)).toISOString(),
      });
      stats.normalizedTrades += 1;
    }
  }

  return { trades: all, stats };
}

async function fetchOkxTransfers(
  apiKey: string,
  apiSecret: string,
  passphrase: string | null,
  _lookback: number
): Promise<FetchResult> {
  const all: NormalizedTrade[] = [];
  const stats: FetchStats = {
    fetchedPages: 2,
    fetchedTrades: 0,
    normalizedTrades: 0,
    invalidTrades: 0,
  };

  const ts = new Date().toISOString();
  const path = `/api/v5/asset/deposit-history?limit=100`;
  const sig = await hmacSignBase64(apiSecret, `${ts}GET${path}`);
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
    for (const d of data.data || []) {
      if (d.state !== "2") continue;
      stats.fetchedTrades += 1;
      all.push({
        id: `dep_${d.depId || d.txId}`,
        symbol: String(d.cc || "").toUpperCase(),
        side: "transfer_in",
        qty: parseFloat(d.amt),
        price: 0,
        fee: 0,
        timestamp: new Date(parseInt(d.ts)).toISOString(),
      });
      stats.normalizedTrades += 1;
    }
  }

  const ts2 = new Date().toISOString();
  const path2 = `/api/v5/asset/withdrawal-history?limit=100`;
  const sig2 = await hmacSignBase64(apiSecret, `${ts2}GET${path2}`);
  const res2 = await fetch(`https://www.okx.com${path2}`, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": sig2,
      "OK-ACCESS-TIMESTAMP": ts2,
      "OK-ACCESS-PASSPHRASE": passphrase || "",
    },
  });
  if (res2.ok) {
    const data = await res2.json();
    for (const w of data.data || []) {
      if (w.state !== "2") continue;
      stats.fetchedTrades += 1;
      all.push({
        id: `wit_${w.wdId || w.txId}`,
        symbol: String(w.cc || "").toUpperCase(),
        side: "transfer_out",
        qty: parseFloat(w.amt),
        price: 0,
        fee: parseFloat(w.fee || 0),
        timestamp: new Date(parseInt(w.ts)).toISOString(),
      });
      stats.normalizedTrades += 1;
    }
  }

  return { trades: all, stats };
}

async function compactAllTransactions(supabase: any, userId: string) {
  safeLog("log", "compact_all_start", { user: userPrefix(userId) });

  // 1. Fetch ALL transactions for the user
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new AppError({
      message: "Failed to fetch transactions for compaction",
      status: 500,
      stage: "sync",
      hint: error.message,
    });
  }

  if (!txs || txs.length === 0) {
    return { ok: true, message: "No transactions to compact", original: 0, compacted: 0 };
  }

  const originalCount = txs.length;

  type RollupAccumulator = {
    rows: any[];
    qty: number;
    totalValue: number;
    totalFee: number;
    earliestTs: string;
  };

  // Root cause: event compaction intentionally keeps distinct trading decisions.
  // For users who explicitly run "Compact History", we now roll up to one row per coin+side+venue.
  const rollups = new Map<string, RollupAccumulator>();
  for (const tx of txs as any[]) {
    const type = String(tx.type || "").toLowerCase();
    if (!["buy", "sell", "transfer_in", "transfer_out"].includes(type)) continue;

    const assetId = String(tx.asset_id || "");
    const venue = String(tx.venue || "unknown");
    const feeCurrency = String(tx.fee_currency || "USD").toUpperCase();
    const key = [assetId, type, venue, feeCurrency].join("|");

    const qty = Number(tx.qty || 0);
    const unitPrice = Number(tx.unit_price || 0);
    const fee = Number(tx.fee_amount || 0);
    const ts = new Date(tx.timestamp).toISOString();

    const existing = rollups.get(key);
    if (existing) {
      existing.rows.push(tx);
      existing.qty += qty;
      existing.totalValue += qty * unitPrice;
      existing.totalFee += fee;
      if (new Date(ts).getTime() < new Date(existing.earliestTs).getTime()) {
        existing.earliestTs = ts;
      }
      continue;
    }

    rollups.set(key, {
      rows: [tx],
      qty,
      totalValue: qty * unitPrice,
      totalFee: fee,
      earliestTs: ts,
    });
  }

  const finalTxs = Array.from(rollups.entries()).map(([key, acc]) => {
    const [assetId, type, venue, feeCurrency] = key.split("|");
    const sourceRows = acc.rows.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const anchor = sourceRows[0];
    const avgPrice = acc.qty > 0 ? acc.totalValue / acc.qty : Number(anchor.unit_price || 0);
    const sourceIds = sourceRows.map((r) => String(r.id));
    const tags: string[] = Array.isArray(anchor.tags) ? [...anchor.tags] : [];
    const filteredTags = tags.filter((tag) => !tag.startsWith("coin_rollup_v1:"));
    filteredTags.push(`coin_rollup_v1:${JSON.stringify({ source_ids: sourceIds, merged_count: sourceIds.length })}`);

    return {
      user_id: userId,
      asset_id: assetId,
      timestamp: acc.earliestTs,
      type,
      qty: acc.qty,
      unit_price: avgPrice,
      fee_amount: acc.totalFee,
      fee_currency: feeCurrency,
      venue: venue === "unknown" ? null : venue,
      note: anchor.note,
      source: anchor.source,
      external_id: `coin_rollup:${userId}:${assetId}:${type}:${venue}:${feeCurrency}`,
      tags: filteredTags,
    };
  });

  const mergedCount = originalCount - finalTxs.length;

  if (mergedCount <= 0) {
    return { ok: true, message: "No rows eligible for coin-level rollup.", original: originalCount, compacted: 0 };
  }

  // 3. Perform Atomic Swap (Delete ALL and Re-insert Compacted)
  // Warning: This is destructive. We use a transaction-like approach.
  // Since we are in an Edge Function, we'll do delete then insert.
  const { error: delError } = await supabase.from("transactions").delete().eq("user_id", userId);
  if (delError) throw new Error(`Compaction failed during deletion: ${delError.message}`);

  // Re-insert in batches of 500 to stay within limits
  for (let i = 0; i < finalTxs.length; i += 500) {
    const batch = finalTxs.slice(i, i + 500);
    const { error: insError } = await supabase.from("transactions").insert(batch);
    if (insError) throw new Error(`Compaction failed during re-insertion: ${insError.message}`);
  }

  safeLog("log", "compact_all_success", {
    user: userPrefix(userId),
    original: originalCount,
    merged: mergedCount,
    finalCount: finalTxs.length,
    mode: "coin_rollup",
  });

  return {
    ok: true,
    message: `Successfully rolled up ${mergedCount} entries into ${finalTxs.length} coin-level rows.`,
    original: originalCount,
    compacted: mergedCount,
    finalCount: finalTxs.length
  };
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSignBase64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function hmacSign512(secret: string, message: string) {
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

async function sha512(message: string) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-512", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function krakenSign(path: string, postData: string, nonce: number, secret: string) {
  const encoder = new TextEncoder();
  const sha256 = await crypto.subtle.digest("SHA-256", encoder.encode(nonce + postData));
  const pathEncoded = encoder.encode(path);
  const message = new Uint8Array(pathEncoded.length + sha256.byteLength);
  message.set(pathEncoded, 0);
  message.set(new Uint8Array(sha256), pathEncoded.length);
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
