/**
 * market-signal-sync — Signal ingestion edge function.
 *
 * Prepares extension points for signal families:
 * - Prices
 * - Volatility
 * - Liquidity
 * - Sentiment
 * - Whale activity
 * - Abnormal pump detection
 * - Market breadth / regime context
 *
 * Uses clean provider interfaces with fallback adapters.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Provider interfaces ─────────────────────────────────────────────────────

interface SignalProvider {
  name: string;
  family: string;
  fetch(symbols: string[]): Promise<SignalData[]>;
}

interface SignalData {
  symbol: string;
  family: string;
  provider: string;
  value: number;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ─── Price provider ──────────────────────────────────────────────────────────

class CoinGeckoPriceProvider implements SignalProvider {
  name = "coingecko";
  family = "price";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: wire to CoinGecko API
    // For now, return empty — prices come from existing price_cache
    return [];
  }
}

// ─── Volatility provider ─────────────────────────────────────────────────────

class VolatilityProvider implements SignalProvider {
  name = "derived";
  family = "volatility";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: compute from price history
    // Would calculate 7d and 30d realized volatility from OHLCV data
    return [];
  }
}

// ─── Liquidity provider ──────────────────────────────────────────────────────

class LiquidityProvider implements SignalProvider {
  name = "derived";
  family = "liquidity";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: order book depth, spread analysis
    // Would compute bid/ask spread, depth ratios
    return [];
  }
}

// ─── Sentiment provider ──────────────────────────────────────────────────────

class SentimentProvider implements SignalProvider {
  name = "aggregated";
  family = "sentiment";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: Fear & Greed index, social sentiment
    // Would aggregate from multiple sentiment sources
    return [];
  }
}

// ─── Whale activity provider ─────────────────────────────────────────────────

class WhaleActivityProvider implements SignalProvider {
  name = "onchain";
  family = "whale";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: on-chain whale movements
    // Would track large transfers, exchange inflows/outflows
    return [];
  }
}

// ─── Pump detection provider ─────────────────────────────────────────────────

class PumpDetectionProvider implements SignalProvider {
  name = "derived";
  family = "pump_detection";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: abnormal volume/price correlation
    // Would detect pump-and-dump patterns from historical data
    return [];
  }
}

// ─── Market breadth provider ─────────────────────────────────────────────────

class MarketBreadthProvider implements SignalProvider {
  name = "derived";
  family = "breadth";

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Extension point: advance/decline, new highs/lows
    // Would compute market-wide breadth indicators
    return [];
  }
}

// ─── Fallback adapter ────────────────────────────────────────────────────────

class FallbackProvider implements SignalProvider {
  name: string;
  family: string;

  constructor(family: string) {
    this.name = "fallback";
    this.family = family;
  }

  async fetch(symbols: string[]): Promise<SignalData[]> {
    // Returns neutral/default signals when live provider is unavailable
    return symbols.map((sym) => ({
      symbol: sym,
      family: this.family,
      provider: "fallback",
      value: 0.5, // neutral
      metadata: { reason: "live_provider_unavailable" },
      timestamp: new Date().toISOString(),
    }));
  }
}

// ─── Signal sync orchestrator ────────────────────────────────────────────────

const PROVIDERS: SignalProvider[] = [
  new CoinGeckoPriceProvider(),
  new VolatilityProvider(),
  new LiquidityProvider(),
  new SentimentProvider(),
  new WhaleActivityProvider(),
  new PumpDetectionProvider(),
  new MarketBreadthProvider(),
];

const FALLBACK_FAMILIES = [
  "price",
  "volatility",
  "liquidity",
  "sentiment",
  "whale",
  "pump_detection",
  "breadth",
];

async function syncSignals(
  symbols: string[],
): Promise<{ results: SignalData[]; errors: string[] }> {
  const allResults: SignalData[] = [];
  const errors: string[] = [];

  for (const provider of PROVIDERS) {
    try {
      const data = await provider.fetch(symbols);
      allResults.push(...data);
    } catch (err) {
      const message = `${provider.family}/${provider.name}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(message);

      // Use fallback
      const fallback = new FallbackProvider(provider.family);
      const fallbackData = await fallback.fetch(symbols);
      allResults.push(...fallbackData);
    }
  }

  // Ensure all families have data
  const coveredFamilies = new Set(allResults.map((r) => r.family));
  for (const family of FALLBACK_FAMILIES) {
    if (!coveredFamilies.has(family)) {
      const fallback = new FallbackProvider(family);
      const fallbackData = await fallback.fetch(symbols);
      allResults.push(...fallbackData);
    }
  }

  return { results: allResults, errors };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const symbols = body.symbols || [];

    if (!Array.isArray(symbols) || symbols.length === 0) {
      // Default: get symbols from user positions
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "No symbols provided. Pass symbols array to sync specific assets.",
          providers: PROVIDERS.map((p) => ({
            name: p.name,
            family: p.family,
          })),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const startTs = Date.now();
    const { results, errors } = await syncSignals(symbols);
    const elapsed = Date.now() - startTs;

    return new Response(
      JSON.stringify({
        success: true,
        signals_synced: results.length,
        families_covered: [...new Set(results.map((r) => r.family))],
        errors,
        elapsed_ms: elapsed,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[market-signal-sync] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
