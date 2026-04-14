import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildPortfolioSnapshot } from "../_shared/portfolio-snapshot.ts";
import { calculateRiskMetrics } from "../_shared/risk-engine.ts";
import { fetchGeminiText } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function streamAsOpenAiSse(text: string) {
  const encoder = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,1200}/g) || [text];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`
          )
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

function streamAnthropicAsOpenAiSse(body: ReadableStream<Uint8Array> | null) {
  if (!body) {
    return streamAsOpenAiSse("No response body returned from Anthropic.");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    start(controller) {
      const reader = body.getReader();
      let buffer = "";

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            let eventBoundary = buffer.indexOf("\n\n");
            while (eventBoundary !== -1) {
              const eventBlock = buffer.slice(0, eventBoundary).trim();
              buffer = buffer.slice(eventBoundary + 2);

              const dataLine = eventBlock
                .split("\n")
                .find((line) => line.startsWith("data:"));

              if (dataLine) {
                const jsonText = dataLine.slice(5).trim();
                if (jsonText && jsonText !== "[DONE]") {
                  try {
                    const payload = JSON.parse(jsonText);
                    const deltaText = payload.delta?.text
                      || payload.content_block?.text
                      || payload.choices?.[0]?.delta?.content;
                    if (deltaText) {
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ choices: [{ delta: { content: deltaText } }] })}\n\n`
                        )
                      );
                    }
                  } catch {
                    // Ignore malformed streaming payloads and keep reading.
                  }
                }
              }

              eventBoundary = buffer.indexOf("\n\n");
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      };

      pump();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

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

    // Authenticate user
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "AUTH_DEBUG: " + (userError?.message || "User not found") }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userInstruction = (body.instruction || "").trim();

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

    // Step 1: Re-engineer the user instruction into a professional prompt
    // using Gemini Direct API
    if (!geminiKey && !anthropicKey) {
      return new Response(JSON.stringify({ error: "No AI API keys configured. Set them in Settings > AI Keys." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reEngineerPrompt = `You are a prompt engineer specializing in crypto portfolio analysis. Your job is to take a casual user instruction and transform it into a precise, professional prompt that will produce high-quality portfolio analysis from an AI model.

RULES:
- Output ONLY the re-engineered prompt text. No explanations, no meta-commentary.
- The output prompt must instruct the model to analyze the user's REAL portfolio data (which will be provided as context).
- Include instructions for the model to provide specific, actionable insights.
- The prompt should ask for structured reasoning: market context, portfolio-specific analysis, and risk considerations.
- The prompt should instruct the model to be advisory, not prescriptive.
- Keep the output prompt under 500 words.
- Preserve the user's original intent.

User instruction: "${userInstruction}"`;

    let professionalPrompt = userInstruction;
    
    if (geminiKey) {
      try {
        professionalPrompt = await fetchGeminiText({
          apiKey: geminiKey,
          prompt: reEngineerPrompt,
          timeoutMs: 45000,
          maxOutputTokens: 2048,
        }) || userInstruction;
      } catch (err) {
        console.warn("Gemini prompt re-engineering failed:", err);
      }
    } else if (anthropicKey) {
      const reEngineerResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages: [{ role: "user", content: reEngineerPrompt }],
        }),
      });
      if (reEngineerResponse.ok) {
        const reEngineered = await reEngineerResponse.json();
        professionalPrompt = reEngineered.content?.[0]?.text || userInstruction;
      }
    }



    // Step 2: DUAL ENGINE PIPELINE
    let geminiAnalysis = "Gemini analysis skipped (no key).";
    
    // 2a. Gemini Broad Analysis (If available)
    if (geminiKey) {
      const geminiPrompt = `You are a crypto research engine. Provide a detailed, data-driven analysis of the portfolio based on the user's prompt. Focus on diversification and market positioning. Use ENGLISH only.
      
      User Prompt: ${professionalPrompt}
      
      ${portfolioContext}`;
      try {
        geminiAnalysis = await fetchGeminiText({
          apiKey: geminiKey,
          prompt: geminiPrompt,
          timeoutMs: 45000,
          maxOutputTokens: 2048,
        }) || "";
      } catch (err) {
        console.warn("Gemini broad analysis failed:", err);
        geminiAnalysis = "Gemini analysis unavailable; proceeding with portfolio context only.";
      }
    }

    // 2b. Claude Synthesis Pipeline (Streaming)
    if (!anthropicKey && !geminiKey) {
        throw new Error("No AI API keys configured. Set them in Settings > AI Keys.");
    }

    const claudeSystemCommand = `You are the lead Portfolio Strategist. You manage a dual-model analysis pipeline.
Your job is to take the raw analysis from the Gemini Research Engine and synthesize it with the real portfolio data into a final, high-signal response for the user.

RULES:
- Acknowledge that this is a "Multi-Model Consensus" analysis.
- Be extremely rigorous about risk: check for concentration, correlation, and pump risk.
- If Gemini missed a critical risk, highlight it.
- Format with clear Markdown headers.
- Maintain a professional, senior analyst tone.
- Base ALL analysis on the provided data.
- Output ONLY in ENGLISH. No other languages allowed.`;

    const claudeUserPrompt = `User Instruction: ${professionalPrompt}

Initial Research Findings (from Gemini Engine):
${geminiAnalysis}

Portfolio Context:
${portfolioContext}`;

    if (anthropicKey) {
      const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 4096,
          system: claudeSystemCommand,
          messages: [
            { role: "user", content: claudeUserPrompt },
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
      return streamAnthropicAsOpenAiSse(analysisResponse.body);
    }

    const geminiFinalPrompt = `${claudeSystemCommand}

User Instruction: ${professionalPrompt}

Initial Research Findings (from Gemini Engine):
${geminiAnalysis}

Portfolio Context:
${portfolioContext}`;

    const finalText = await fetchGeminiText({
      apiKey: geminiKey,
      prompt: geminiFinalPrompt,
      timeoutMs: 45000,
      maxOutputTokens: 4096,
    });

    return streamAsOpenAiSse(finalText || "Unable to generate analysis.");
  } catch (err: any) {
    console.error("ai-chat error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
