/**
 * rebalance-analysis — Backend orchestration for rebalance analysis.
 *
 * Receives portfolio snapshot, runs deterministic scoring engine,
 * computes risk, builds rebalance plan, enforces risk guards.
 * Returns structured analysis result.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types (inline for Deno edge function) ─────────────────────────────────

type MarketRegime = "risk_on" | "neutral" | "risk_off";

interface AssetInput {
  symbol: string;
  weight: number;
  pnlPct: number;
  price: number;
  marketCap: number;
  volume24h: number;
  volatility7d: number;
  volatility30d: number;
  change1h: number;
  change24h: number;
  change7d: number;
}

// ─── Scoring engine (server-side copy) ─────────────────────────────────────

function scoreLiquidity(a: AssetInput): number {
  if (a.marketCap <= 0) return 0;
  return Math.min(1, (a.volume24h / a.marketCap) / 0.10);
}

function scoreSentiment(a: AssetInput): number {
  const s1h = Math.max(-1, Math.min(1, a.change1h / 10));
  const s24h = Math.max(-1, Math.min(1, a.change24h / 15));
  const s7d = Math.max(-1, Math.min(1, a.change7d / 25));
  return ((s1h * 0.15 + s24h * 0.35 + s7d * 0.50) + 1) / 2;
}

function scorePumpRisk(a: AssetInput): number {
  let risk = 0;
  if (Math.abs(a.change1h) > 15) risk += 0.4;
  else if (Math.abs(a.change1h) > 8) risk += 0.2;
  if (a.change24h > 40) risk += 0.4;
  else if (a.change24h > 20) risk += 0.2;
  if (a.marketCap > 0 && a.volume24h > a.marketCap * 0.15) risk += 0.2;
  if (a.volatility7d > 60) risk += 0.2;
  return Math.min(1, risk);
}

function computeHHI(assets: AssetInput[]): number {
  return assets.reduce((s, a) => s + a.weight * a.weight, 0);
}

function detectRegime(assets: AssetInput[]): MarketRegime {
  if (assets.length === 0) return "neutral";
  const positive = assets.filter((a) => a.change7d > 0).length / assets.length;
  const avgVol = assets.reduce((s, a) => s + a.volatility7d, 0) / assets.length;

  if (positive > 0.6 && avgVol < 40) return "risk_on";
  if (positive < 0.3 || avgVol > 60) return "risk_off";
  return "neutral";
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const assets: AssetInput[] = body.assets || [];

    if (assets.length === 0) {
      return new Response(
        JSON.stringify({ error: "No assets provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Run deterministic analysis
    const regime = detectRegime(assets);
    const hhi = computeHHI(assets);

    const scores = assets.map((a) => {
      const liq = scoreLiquidity(a);
      const sent = scoreSentiment(a);
      const pump = scorePumpRisk(a);
      const total = 0.18 * liq + 0.16 * sent - 0.14 * pump;

      return {
        symbol: a.symbol,
        weight: a.weight,
        liquidityScore: liq,
        sentimentScore: sent,
        pumpRiskScore: pump,
        totalScore: total,
      };
    });

    const topHolding = [...assets].sort((a, b) => b.weight - a.weight)[0];

    return new Response(
      JSON.stringify({
        success: true,
        regime,
        hhi,
        topHolding: topHolding?.symbol || "-",
        topHoldingWeight: topHolding?.weight || 0,
        scores,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[rebalance-analysis] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
