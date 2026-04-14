import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildPortfolioSnapshot } from "./portfolioSnapshot.ts";
import { calculateRiskMetrics } from "./riskEngine.ts";
import { aggregateMarketSignals } from "./signalEngine.ts";
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

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { analysisType = "portfolio", model = "claude", riskProfile = "moderate" } = body;

    // 1. Build context
    const snapshot = await buildPortfolioSnapshot(serviceClient, user.id);
    const risk = calculateRiskMetrics(snapshot);
    const signals = await aggregateMarketSignals(serviceClient, snapshot.holdings);
    
    // 2. Build Prompt
    const prompt = buildPrompt(snapshot, risk, signals, riskProfile);

    // 3. Get API keys
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

    const { data: userPrefs } = await serviceClient
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", user.id)
      .in("key", ["anthropic_api_key", "gemini_api_key"]);

    if (userPrefs) {
      for (const p of userPrefs) {
        if (p.key === "anthropic_api_key" && p.value?.startsWith("sk-ant-")) anthropicKey = p.value;
        if (p.key === "gemini_api_key" && p.value) geminiKey = p.value;
      }
    }

    // 4. Route to model
    const startMs = Date.now();
    let modelResponse: any;
    let usedModel = model;

    try {
      modelResponse = await routeModel(model, prompt, {
        anthropicKey,
        geminiKey,
        timeoutMs: 45000,
      });
    } catch (modelErr: any) {
      console.warn(`Primary model ${model} failed: ${modelErr.message}. Trying fallback.`);
      const fallbackModel = model === "claude" ? "gemini" : "claude";
      try {
        modelResponse = await routeModel(fallbackModel, prompt, {
          anthropicKey,
          geminiKey,
          timeoutMs: 45000,
        });
        usedModel = fallbackModel;
      } catch (fallbackErr: any) {
        throw new Error(`AI models failed: ${fallbackErr.message}`);
      }
    }

    const latencyMs = Date.now() - startMs;

    // 5. Validate & Log
    const validated = validateResponse(modelResponse);
    
    await serviceClient.from("ai_analysis_runs").insert({
      user_id: user.id,
      context_json: { snapshot, risk, signals, riskProfile },
      final_response: modelResponse,
      status: validated.valid ? "success" : "partial",
      provider_latency_ms: { [usedModel]: latencyMs },
    });

    return new Response(JSON.stringify({
      ...modelResponse,
      model: usedModel,
      timestamp: new Date().toISOString(),
      portfolioSummary: {
        value: snapshot.totalValue,
        cash: snapshot.cashUsdt,
        riskLevel: risk.overallRiskLevel,
        diversificationScore: risk.diversificationScore,
      },
      warnings: [
        ...(modelResponse.warnings || []),
        ...risk.warnings.map(w => ({ ...w, type: 'risk_engine' })),
      ]
    }), {
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
