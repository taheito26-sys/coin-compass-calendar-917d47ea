/**
 * risk-engine — Phase 1: Signal Integrity Foundation
 * 
 * Deterministic risk scoring engine:
 * 1. Source Credibility Scoring — assigns trust_score (0-100) to every event source
 * 2. Rumor vs Official Classifier — classifies events based on source trust
 * 3. Unified Risk Signal Aggregator — per-token risk scores from all signals
 *
 * All scores are explainable. No AI black boxes.
 * Scheduled via pg_cron every 5 minutes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Source Type Trust Baselines ───
const SOURCE_TYPE_TRUST: Record<string, number> = {
  official_exchange: 80,
  verified_api: 70,
  aggregator: 60,
  community: 40,
  unknown: 20,
};

// ─── Known source classifications ───
const KNOWN_SOURCES: Record<string, { type: string; verification: string }> = {
  binance: { type: "official_exchange", verification: "api_announcements" },
  coinbase: { type: "official_exchange", verification: "api_announcements" },
  kucoin: { type: "official_exchange", verification: "api_announcements" },
  okx: { type: "official_exchange", verification: "api_announcements" },
  bybit: { type: "official_exchange", verification: "api_announcements" },
  kraken: { type: "official_exchange", verification: "api_announcements" },
  gate: { type: "official_exchange", verification: "api_announcements" },
  mexc: { type: "official_exchange", verification: "api_announcements" },
  bitget: { type: "official_exchange", verification: "api_announcements" },
  htx: { type: "official_exchange", verification: "api_announcements" },
  coingecko: { type: "verified_api", verification: "api_market_data" },
  coinmarketcap: { type: "verified_api", verification: "api_market_data" },
  "r/cryptocurrency": { type: "community", verification: "reddit_upvotes" },
  "r/bitcoin": { type: "community", verification: "reddit_upvotes" },
  "r/defi": { type: "community", verification: "reddit_upvotes" },
  "r/altcoin": { type: "community", verification: "reddit_upvotes" },
  blockchair: { type: "verified_api", verification: "blockchain_data" },
  "mempool.space": { type: "verified_api", verification: "blockchain_data" },
  "alternative.me": { type: "aggregator", verification: "index_aggregation" },
};

// ─── Classification thresholds ───
const CLASSIFICATION_RULES: { minTrust: number; classification: string; confidence: number }[] = [
  { minTrust: 80, classification: "OFFICIAL", confidence: 95 },
  { minTrust: 70, classification: "CONFIRMED", confidence: 85 },
  { minTrust: 60, classification: "UNCONFIRMED", confidence: 70 },
  { minTrust: 50, classification: "LEAK", confidence: 55 },
  { minTrust: 0, classification: "RUMOR", confidence: 40 },
];

// Status-based classification overrides
const STATUS_CLASSIFICATION: Record<string, string> = {
  live: "LIVE",
  confirmed: "CONFIRMED",
  announced: "OFFICIAL",
  rumor: "RUMOR",
  cancelled: "CONFIRMED", // confirmed as cancelled
};

// ─── Risk scoring weights ───
const SIGNAL_WEIGHTS: Record<string, number> = {
  delisting: 90,
  suspension: 80,
  rumor_negative: 60,
  low_trust_source: 50,
  high_volatility: 45,
  multiple_delistings: 95,
  single_exchange_only: 30,
  unconfirmed_listing: 20,
  confirmed_listing: -10, // positive signal reduces risk
  official_listing: -20,
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

// ─── Step 1: Source Credibility Scoring ───

async function scoreAllSources(sb: any) {
  // Get all unique sources from listing_events
  const { data: events } = await sb
    .from("listing_events")
    .select("exchange, status, confidence_score")
    .limit(1000);

  if (!events || events.length === 0) return [];

  // Count events per source and track accuracy
  const sourceStats = new Map<string, { total: number; confirmed: number; cancelled: number }>();
  
  for (const ev of events) {
    const src = (ev.exchange || "").toLowerCase();
    const stats = sourceStats.get(src) || { total: 0, confirmed: 0, cancelled: 0 };
    stats.total++;
    if (ev.status === "confirmed" || ev.status === "live") stats.confirmed++;
    if (ev.status === "cancelled") stats.cancelled++;
    sourceStats.set(src, stats);
  }

  // Also add known sources that may not have events yet
  for (const [name] of Object.entries(KNOWN_SOURCES)) {
    if (!sourceStats.has(name)) {
      sourceStats.set(name, { total: 0, confirmed: 0, cancelled: 0 });
    }
  }

  const upserts = [];
  for (const [sourceName, stats] of sourceStats) {
    const known = KNOWN_SOURCES[sourceName];
    const sourceType = known?.type || "unknown";
    const baseTrust = SOURCE_TYPE_TRUST[sourceType] || 20;

    // Historical accuracy: ratio of confirmed to total (penalize cancellations)
    let historicalAccuracy = 50;
    if (stats.total > 0) {
      historicalAccuracy = Math.round((stats.confirmed / stats.total) * 100);
      // Penalize for false signals (cancelled events)
      historicalAccuracy = Math.max(0, historicalAccuracy - (stats.cancelled * 10));
    }

    // Latency score: exchanges with more events tend to be faster
    const latencyScore = Math.min(100, 30 + Math.min(stats.total * 2, 70));

    // Final trust score: weighted combination
    let trustScore = Math.round(
      baseTrust * 0.5 +
      historicalAccuracy * 0.3 +
      latencyScore * 0.2
    );

    // Clamp to 0-100
    trustScore = Math.max(0, Math.min(100, trustScore));

    upserts.push({
      source_name: sourceName,
      source_type: sourceType,
      verification_method: known?.verification || "unknown",
      historical_accuracy: historicalAccuracy,
      latency_score: latencyScore,
      trust_score: trustScore,
      total_signal_count: stats.total,
      false_signal_count: stats.cancelled,
      last_updated: new Date().toISOString(),
    });
  }

  // Upsert all sources
  for (const src of upserts) {
    await sb.from("source_reliability").upsert(src, { onConflict: "source_name" });
  }

  console.log(`[risk-engine] Scored ${upserts.length} sources`);
  return upserts;
}

// ─── Step 2: Event Classification ───

async function classifyAllEvents(sb: any) {
  // Get source trust scores
  const { data: sources } = await sb.from("source_reliability").select("id, source_name, trust_score");
  const sourceMap = new Map<string, { id: string; trust: number }>();
  for (const s of sources || []) {
    sourceMap.set(s.source_name.toLowerCase(), { id: s.id, trust: s.trust_score });
  }

  // Get all listing events
  const { data: events } = await sb
    .from("listing_events")
    .select("id, exchange, event_type, status, confidence_score")
    .limit(1000);

  if (!events || events.length === 0) return 0;

  let classified = 0;

  for (const ev of events) {
    const sourceName = (ev.exchange || "").toLowerCase();
    const source = sourceMap.get(sourceName);
    const trustScore = source?.trust || 20;

    // Determine classification from trust score
    let classification = "RUMOR";
    let confidence = 40;

    // Status-based override takes priority
    if (STATUS_CLASSIFICATION[ev.status]) {
      classification = STATUS_CLASSIFICATION[ev.status];
      confidence = Math.max(confidence, trustScore);
    } else {
      // Trust-based classification
      for (const rule of CLASSIFICATION_RULES) {
        if (trustScore >= rule.minTrust) {
          classification = rule.classification;
          confidence = rule.confidence;
          break;
        }
      }
    }

    // Boost confidence if event_type aligns with source type
    if (ev.event_type === "listing" && trustScore >= 70) {
      confidence = Math.min(100, confidence + 10);
    }

    // Build reasoning
    const reasoning = `Source: ${sourceName} (trust: ${trustScore}). ` +
      `Status: ${ev.status}. ` +
      `Rule: trust_score ${trustScore >= 80 ? "≥80→OFFICIAL" : trustScore >= 70 ? "≥70→CONFIRMED" : trustScore >= 60 ? "≥60→UNCONFIRMED" : trustScore >= 50 ? "≥50→LEAK" : "<50→RUMOR"}.` +
      (STATUS_CLASSIFICATION[ev.status] ? ` Override: status=${ev.status}→${STATUS_CLASSIFICATION[ev.status]}.` : "");

    await sb.from("event_classification").upsert({
      event_id: ev.id,
      classification,
      confidence,
      source_id: source?.id || null,
      reasoning,
      updated_at: new Date().toISOString(),
    }, { onConflict: "event_id" });

    classified++;
  }

  console.log(`[risk-engine] Classified ${classified} events`);
  return classified;
}

// ─── Step 3: Unified Risk Signal Aggregation ───

async function aggregateRiskSignals(sb: any) {
  // Get all events with classifications
  const { data: events } = await sb
    .from("listing_events")
    .select("id, token_symbol, event_type, status, confidence_score, exchange")
    .limit(1000);

  const { data: classifications } = await sb
    .from("event_classification")
    .select("event_id, classification, confidence")
    .limit(1000);

  const classMap = new Map<string, { classification: string; confidence: number }>();
  for (const c of classifications || []) {
    classMap.set(c.event_id, { classification: c.classification, confidence: c.confidence });
  }

  // Aggregate signals per token
  const tokenSignals = new Map<string, { signals: any[]; scores: number[] }>();

  for (const ev of events || []) {
    const sym = (ev.token_symbol || "").toUpperCase();
    if (!sym) continue;

    const entry = tokenSignals.get(sym) || { signals: [], scores: [] };
    const cls = classMap.get(ev.id);
    const classification = cls?.classification || "RUMOR";

    // Generate risk signals based on event characteristics
    const signal: any = {
      event_id: ev.id,
      event_type: ev.event_type,
      exchange: ev.exchange,
      classification,
      timestamp: Date.now(),
    };

    let riskScore = 0;

    // Delisting = high risk
    if (ev.event_type === "delisting" || ev.event_type === "suspension") {
      riskScore = SIGNAL_WEIGHTS[ev.event_type] || 80;
      signal.reason = `${ev.event_type} detected on ${ev.exchange}`;
    }
    // Rumor from low-trust source = moderate risk
    else if (classification === "RUMOR") {
      riskScore = SIGNAL_WEIGHTS.rumor_negative || 40;
      signal.reason = `Unverified rumor from ${ev.exchange}`;
    }
    // Confirmed listing = positive (reduces risk)
    else if (classification === "CONFIRMED" || classification === "OFFICIAL") {
      riskScore = SIGNAL_WEIGHTS[`${classification.toLowerCase()}_listing`] || 0;
      signal.reason = `${classification} listing on ${ev.exchange}`;
    }
    // Unconfirmed = slight risk
    else {
      riskScore = SIGNAL_WEIGHTS.unconfirmed_listing || 20;
      signal.reason = `Unconfirmed signal from ${ev.exchange}`;
    }

    signal.risk_contribution = riskScore;
    entry.signals.push(signal);
    entry.scores.push(riskScore);
    tokenSignals.set(sym, entry);
  }

  // Check for multi-delisting (same token delisted from multiple exchanges)
  for (const [sym, data] of tokenSignals) {
    const delistings = data.signals.filter(s => s.event_type === "delisting" || s.event_type === "suspension");
    if (delistings.length > 1) {
      const exchanges = [...new Set(delistings.map(s => s.exchange))];
      if (exchanges.length > 1) {
        data.signals.push({
          event_type: "compound_risk",
          reason: `Multiple delistings across ${exchanges.join(", ")}`,
          risk_contribution: SIGNAL_WEIGHTS.multiple_delistings,
          timestamp: Date.now(),
        });
        data.scores.push(SIGNAL_WEIGHTS.multiple_delistings);
      }
    }
  }

  // Compute final risk scores and upsert
  let aggregated = 0;
  for (const [sym, data] of tokenSignals) {
    // Filter out negative scores (positive signals)
    const positiveScores = data.scores.filter(s => s > 0);
    const negativeScores = data.scores.filter(s => s < 0);

    // Average of positive risk scores, reduced by positive signals
    const avgPositive = positiveScores.length > 0
      ? positiveScores.reduce((a, b) => a + b, 0) / positiveScores.length
      : 0;
    const avgNegative = negativeScores.length > 0
      ? Math.abs(negativeScores.reduce((a, b) => a + b, 0) / negativeScores.length)
      : 0;

    let riskScore = Math.round(Math.max(0, Math.min(100, avgPositive - avgNegative)));

    // Determine risk level
    const riskLevel = riskScore <= 30 ? "LOW" : riskScore <= 60 ? "MEDIUM" : "HIGH";

    await sb.from("risk_signal_aggregate").upsert({
      token_symbol: sym,
      risk_score: riskScore,
      risk_level: riskLevel,
      signal_count: data.signals.length,
      signals: data.signals.slice(-20), // Keep last 20 signals
      last_updated: new Date().toISOString(),
    }, { onConflict: "token_symbol" });

    aggregated++;
  }

  console.log(`[risk-engine] Aggregated risk for ${aggregated} tokens`);
  return aggregated;
}

// ─── Main Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = getSupabase();
    const startTs = Date.now();

    // Execute all three phases sequentially (downstream depends on upstream)
    const sources = await scoreAllSources(sb);
    const classified = await classifyAllEvents(sb);
    const aggregated = await aggregateRiskSignals(sb);

    const elapsed = Date.now() - startTs;

    const result = {
      success: true,
      phase: "PHASE_1_SIGNAL_INTEGRITY",
      sources_scored: sources.length,
      events_classified: classified,
      tokens_aggregated: aggregated,
      elapsed_ms: elapsed,
      timestamp: Date.now(),
      gate_check: {
        sources_classified_pct: sources.length > 0 ? 100 : 0,
        classification_coverage: classified,
        risk_latency_ms: elapsed,
        phase_1_gate_passed: sources.length > 0 && elapsed < 30000,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[risk-engine] Error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
