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

const ARABIC_FALLBACK = {
  marketState: { regime: "neutral", summary_ar: "الصورة غير واضحة حالياً" },
  risk: { primary_ar: "الأفضل التريث ومراقبة السيولة" },
  decision: { action_ar: "تقليل التركز والاحتفاظ بجزء في USDT" },
  opportunity: { replacement_ar: "لا توجد فرصة واضحة حالياً" },
  compactSummary: { text_ar: "البيانات الحالية غير كافية لتحليل دقيق، يرجى المحاولة لاحقاً." }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { analysisType = "portfolio", model = "claude", riskProfile = "moderate" } = body;

    // 1. Build Data Context
    const snapshot = await buildPortfolioSnapshot(serviceClient, user.id);
    const risk = calculateRiskMetrics(snapshot);
    const signals = await aggregateMarketSignals(serviceClient, snapshot.holdings);
    
    // Merge signals and risk
    signals.concentration = {
      hhi: risk.hhi,
      maxAsset: risk.maxAssetSymbol,
      maxWeight: risk.maxAssetWeight
    };

    // 2. Build Prompt
    const prompt = buildPrompt(snapshot, risk, signals, riskProfile);

    // 3. API Keys
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const { data: userPrefs } = await serviceClient.from("user_preferences").select("key, value").eq("user_id", user.id).in("key", ["anthropic_api_key", "gemini_api_key"]);
    if (userPrefs) {
      for (const p of userPrefs) {
        if (p.key === "anthropic_api_key" && p.value?.startsWith("sk-ant-")) anthropicKey = p.value;
        if (p.key === "gemini_api_key" && p.value?.startsWith("AIza")) geminiKey = p.value;
      }
    }

    // 4. Model Invocation
    const startMs = Date.now();
    let modelResponse: any;
    let usedModel = model;

    try {
      modelResponse = await routeModel(model, prompt, { anthropicKey, geminiKey, timeoutMs: 15000 });
      const validated = validateResponse(modelResponse);
      if (!validated.valid) throw new Error("Schema validation failed");
    } catch (err) {
      console.warn(`AI analysis failed or invalid: ${err.message}. Using safe Arabic fallback.`);
      modelResponse = ARABIC_FALLBACK;
      usedModel = "fallback";
    }

    const latencyMs = Date.now() - startMs;

    // 5. Final Output Structure (Matching requested features)
    const finalResponse = {
      model: usedModel,
      timestamp: new Date().toISOString(),
      analysis: modelResponse,
      portfolioMeta: {
        totalValue: snapshot.totalValue,
        stablecoinRatio: snapshot.stablecoinRatio,
        riskLevel: risk.overallRiskLevel
      }
    };

    // 6. Audit Logging
    await serviceClient.from("ai_analysis_runs").insert({
      user_id: user.id,
      context_json: { snapshot, risk, signals, riskProfile },
      final_response: finalResponse,
      status: usedModel === "fallback" ? "partial" : "success",
      provider_latency_ms: { [usedModel]: latencyMs }
    });

    return new Response(JSON.stringify(finalResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ai-analysis error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
