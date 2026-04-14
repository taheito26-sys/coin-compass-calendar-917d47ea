import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildPortfolioSnapshot } from "./portfolioSnapshot.ts";
import { calculateRiskMetrics } from "./riskEngine.ts";
import { buildPrompt } from "./promptBuilder.ts";
import { routeModel } from "./modelRouter.ts";
import { validateResponse } from "./responseValidator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client to get user
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB reads
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { analysisType = "portfolio", model = "claude", riskProfile = "moderate" } = body;

    // Validate inputs
    if (!["portfolio", "asset", "rebalance"].includes(analysisType)) {
      return new Response(JSON.stringify({ error: "Invalid analysisType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["claude", "gemini"].includes(model)) {
      return new Response(JSON.stringify({ error: "Invalid model" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["conservative", "moderate", "aggressive"].includes(riskProfile)) {
      return new Response(JSON.stringify({ error: "Invalid riskProfile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Build portfolio snapshot from real data
    const snapshot = await buildPortfolioSnapshot(serviceClient, user.id);

    // 2. Calculate risk metrics
    const risk = calculateRiskMetrics(snapshot);

    // 3. Build prompt
    const prompt = buildPrompt(snapshot, risk, analysisType, riskProfile);

    // 4. Get API keys - check user preferences first, then env
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = "";
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";

    // Check user-configured keys
    const { data: userPrefs } = await serviceClient
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", user.id)
      .in("key", ["anthropic_api_key", "gemini_api_key"]);

    if (userPrefs) {
      for (const p of userPrefs) {
        if (p.key === "anthropic_api_key" && p.value) anthropicKey = p.value;
        if (p.key === "gemini_api_key" && p.value) geminiKey = p.value;
      }
    }

    // 5. Route to model
    const startMs = Date.now();
    let modelResponse: any;
    let usedModel = model;

    try {
      modelResponse = await routeModel(model, prompt, {
        anthropicKey,
        geminiKey,
        lovableKey,
        timeoutMs: 15000,
      });
    } catch (modelErr: any) {
      // If primary model fails, try fallback
      const fallbackModel = model === "claude" ? "gemini" : "claude";
      console.warn(`Primary model ${model} failed: ${modelErr.message}. Trying ${fallbackModel}`);
      try {
        modelResponse = await routeModel(fallbackModel, prompt, {
          anthropicKey,
          geminiKey,
          lovableKey,
          timeoutMs: 15000,
        });
        usedModel = fallbackModel;
      } catch (fallbackErr: any) {
        // Both failed - return deterministic fallback
        console.warn(`Fallback model also failed: ${fallbackErr.message}. Using deterministic analysis.`);
        modelResponse = generateDeterministicFallback(snapshot, risk, riskProfile);
        usedModel = "deterministic";
      }
    }

    const latencyMs = Date.now() - startMs;

    // 6. Validate response
    const validated = validateResponse(modelResponse);
    if (!validated.valid) {
      // Use deterministic fallback on validation failure
      console.warn(`Validation failed: ${validated.errors?.join(", ")}. Using deterministic fallback.`);
      modelResponse = generateDeterministicFallback(snapshot, risk, riskProfile);
      usedModel = "deterministic";
    }

    // 7. Build final response
    const finalResponse = {
      model: usedModel,
      timestamp: new Date().toISOString(),
      portfolioSummary: {
        value: snapshot.totalValue,
        cash: snapshot.cashUsdt,
        riskLevel: risk.overallRiskLevel,
        diversificationScore: risk.diversificationScore,
      },
      recommendations: modelResponse.recommendations || [],
      rebalancePlan: modelResponse.rebalancePlan || [],
      warnings: [
        ...risk.warnings,
        ...(modelResponse.warnings || []),
      ],
    };

    // 8. Audit log
    const inputHash = await hashString(JSON.stringify({ snapshot: snapshot.holdings.length, risk: risk.overallRiskLevel }));
    const outputHash = await hashString(JSON.stringify(finalResponse).slice(0, 500));

    await serviceClient.from("ai_analysis_runs").insert({
      user_id: user.id,
      context_hash: inputHash,
      context_json: { snapshot, risk, analysisType, riskProfile },
      final_response: finalResponse,
      status: usedModel === "deterministic" ? "partial" : "success",
      provider_latency_ms: { [usedModel]: latencyMs },
      ...(usedModel === "claude" ? { claude_response: modelResponse } : {}),
      ...(usedModel === "gemini" ? { gemini_response: modelResponse } : {}),
    });

    return new Response(JSON.stringify(finalResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ai-analysis error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateDeterministicFallback(snapshot: any, risk: any, riskProfile: string) {
  const recommendations: any[] = [];

  // Concentration warnings → reduce recommendations
  for (const h of snapshot.holdings) {
    const weight = snapshot.totalValue > 0 ? (h.marketValue / snapshot.totalValue) : 0;
    if (weight > 0.4) {
      recommendations.push({
        action: "sell",
        asset: h.symbol,
        confidence: 0.7,
        priority: "high",
        reason: {
          market: "Deterministic analysis - no model available",
          portfolio: `${h.symbol} represents ${(weight * 100).toFixed(1)}% of portfolio, exceeding 40% concentration threshold`,
          risk: "High concentration risk requires reduction",
        },
      });
    }
  }

  // Cash deployment
  if (snapshot.cashUsdt > snapshot.totalValue * 0.3 && snapshot.totalValue > 0) {
    recommendations.push({
      action: "buy",
      asset: "BTC",
      confidence: 0.5,
      priority: "low",
      reason: {
        market: "Deterministic fallback - consider gradual deployment",
        portfolio: `${(snapshot.cashUsdt / snapshot.totalValue * 100).toFixed(1)}% in stablecoins`,
        risk: "DCA approach recommended for risk mitigation",
      },
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: "hold",
      asset: "PORTFOLIO",
      confidence: 0.5,
      priority: "low",
      reason: {
        market: "Deterministic analysis - no model available for live assessment",
        portfolio: "Portfolio appears within normal parameters",
        risk: "Unable to provide AI-driven insights at this time",
      },
    });
  }

  // Rebalance plan
  const rebalancePlan = snapshot.holdings.map((h: any) => {
    const current = snapshot.totalValue > 0 ? (h.marketValue / snapshot.totalValue) * 100 : 0;
    const target = riskProfile === "conservative" ? Math.min(current, 30) : Math.min(current, 40);
    return {
      asset: h.symbol,
      currentAllocation: Math.round(current * 100) / 100,
      targetAllocation: Math.round(target * 100) / 100,
      delta: Math.round((target - current) * 100) / 100,
    };
  });

  return {
    recommendations,
    rebalancePlan,
    warnings: [{ type: "fallback", severity: "medium", message: "AI models unavailable. Showing deterministic analysis only." }],
  };
}

async function hashString(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
