import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildPortfolioSnapshot } from "../ai-analysis/portfolioSnapshot.ts";
import { calculateRiskMetrics } from "../ai-analysis/riskEngine.ts";

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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";

    // Authenticate user
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

    const body = await req.json();
    const userInstruction = (body.instruction || "").trim();
    const selectedModel = body.model || "gemini"; // "claude" | "gemini"

    if (!userInstruction) {
      return new Response(JSON.stringify({ error: "Instruction is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userInstruction.length > 2000) {
      return new Response(JSON.stringify({ error: "Instruction too long (max 2000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB reads
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Build portfolio context
    const snapshot = await buildPortfolioSnapshot(serviceClient, user.id);
    const risk = calculateRiskMetrics(snapshot);

    // Build portfolio summary for context
    const holdingsSummary = snapshot.holdings
      .filter(h => h.marketValue > 0)
      .slice(0, 20)
      .map(h => `${h.symbol}: ${h.qty.toFixed(4)} units, avg cost $${h.avgCost.toFixed(2)}, current $${h.currentPrice.toFixed(2)}, value $${h.marketValue.toFixed(2)}, P/L ${h.pnlPct.toFixed(1)}%, weight ${(h.weight * 100).toFixed(1)}%`)
      .join("\n");

    const portfolioContext = `
PORTFOLIO SNAPSHOT (${snapshot.generatedAt}):
Total Value: $${snapshot.totalValue.toFixed(2)}
Total Cost Basis: $${snapshot.totalCost.toFixed(2)}
Cash (Stablecoins): $${snapshot.cashUsdt.toFixed(2)}
Stablecoin Ratio: ${(snapshot.stablecoinRatio * 100).toFixed(1)}%
Holdings Count: ${snapshot.holdings.length}
Risk Level: ${risk.overallRiskLevel}
Diversification Score: ${risk.diversificationScore}/100
HHI: ${risk.hhi}
Top Holding: ${risk.maxAssetSymbol} at ${(risk.maxAssetWeight * 100).toFixed(1)}%

HOLDINGS:
${holdingsSummary || "No holdings found."}

RISK WARNINGS:
${risk.warnings.map(w => `- [${w.severity}] ${w.message}`).join("\n") || "None"}`;

    // Step 1: Re-engineer the user instruction into a professional prompt
    // using Lovable AI Gateway
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "AI Gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reEngineerResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a prompt engineer specializing in crypto portfolio analysis. Your job is to take a casual user instruction and transform it into a precise, professional prompt that will produce high-quality portfolio analysis from an AI model.

RULES:
- Output ONLY the re-engineered prompt text. No explanations, no meta-commentary.
- The output prompt must instruct the model to analyze the user's REAL portfolio data (which will be provided as context).
- Include instructions for the model to provide specific, actionable insights.
- The prompt should ask for structured reasoning: market context, portfolio-specific analysis, and risk considerations.
- The prompt should instruct the model to be advisory, not prescriptive.
- Keep the output prompt under 500 words.
- Preserve the user's original intent — do not change what they're asking.
- If the user asks something unrelated to crypto/finance, still re-engineer it but note it may be outside the portfolio context.`,
          },
          {
            role: "user",
            content: `User instruction: "${userInstruction}"

Context: The user has a crypto portfolio. Re-engineer this into a professional prompt for a portfolio analysis AI.`,
          },
        ],
      }),
    });

    if (!reEngineerResponse.ok) {
      const status = reEngineerResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Failed to re-engineer prompt");
    }

    const reEngineered = await reEngineerResponse.json();
    const professionalPrompt = reEngineered.choices?.[0]?.message?.content || userInstruction;

    // Step 2: Send the professional prompt + portfolio context to the selected model
    // via streaming through Lovable AI Gateway
    const modelId = selectedModel === "claude"
      ? "openai/gpt-5"  // Claude-equivalent via gateway
      : "google/gemini-2.5-flash";

    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "system",
            content: `You are a senior crypto portfolio analyst. You provide thorough, data-driven analysis based on real portfolio holdings.

RULES:
- Base ALL analysis on the provided portfolio data. Do not invent holdings or prices.
- Be specific: reference actual symbols, weights, and P/L from the data.
- Use advisory language: "consider", "may want to", "suggests".
- Never recommend leverage or margin trading.
- Acknowledge limitations: you don't have real-time market data beyond what's provided.
- Format your response with clear sections using markdown headers.
- Be concise but thorough.`,
          },
          {
            role: "user",
            content: `${professionalPrompt}\n\n---\n\n${portfolioContext}`,
          },
        ],
        stream: true,
      }),
    });

    if (!analysisResponse.ok) {
      const status = analysisResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await analysisResponse.text();
      console.error("Analysis model error:", status, errText);
      throw new Error("Analysis model failed");
    }

    // Stream the response back to the client
    return new Response(analysisResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("ai-chat error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});