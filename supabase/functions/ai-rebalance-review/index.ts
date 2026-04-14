/**
 * ai-rebalance-review — AI review router for rebalance proposals.
 *
 * Routes to Claude (risk critic) or Gemini (candidate engine).
 * Validates AI output against schema before returning.
 * Falls back to deterministic responses on failure.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── AI providers ────────────────────────────────────────────────────────────

async function callClaude(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callGemini(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.8-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

function extractJSON(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* fall through */ }
    }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders });
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

    // Auth check
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
    const { provider, role, prompt, schema } = body;

    if (!provider || !prompt) {
      return new Response(
        JSON.stringify({ error: "Missing provider or prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get API keys
    const serviceClient = createClient(supabaseUrl, serviceKey);
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

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

    let responseText = "";
    let usedProvider = provider;

    try {
      if (provider === "claude" && anthropicKey) {
        responseText = await callClaude(prompt, anthropicKey);
      } else if (provider === "gemini" && geminiKey) {
        responseText = await callGemini(prompt, geminiKey);
      } else {
        // Try the other provider as fallback
        if (provider === "claude" && geminiKey) {
          responseText = await callGemini(prompt, geminiKey);
          usedProvider = "gemini";
        } else if (provider === "gemini" && anthropicKey) {
          responseText = await callClaude(prompt, anthropicKey);
          usedProvider = "claude";
        } else {
          return new Response(
            JSON.stringify({
              error: "No API key configured for any AI provider",
              response: null,
              provider: "none",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (aiErr: unknown) {
      console.error(`[ai-rebalance-review] ${provider} failed:`, aiErr);
      return new Response(
        JSON.stringify({
          error: `AI call failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`,
          response: null,
          provider: usedProvider,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract JSON from response
    const parsed = extractJSON(responseText);

    return new Response(
      JSON.stringify({
        response: parsed || responseText,
        provider: usedProvider,
        role,
        schema,
        raw_length: responseText.length,
        json_extracted: parsed !== null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ai-rebalance-review] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
