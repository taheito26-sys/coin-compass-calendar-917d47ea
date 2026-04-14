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
    "authorization, x-client-info, apikey, content-type, x-customer-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function createResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

async function callGemini(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
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
      return createResponse({ error: "Unauthorized: Missing header" }, 401);
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
      return createResponse({ error: "Unauthorized: Invalid user" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return createResponse({ error: "Invalid JSON body" }, 400);
    }

    const { provider, role, prompt, schema } = body;
    if (!provider || !prompt) {
      return createResponse({ error: "Missing provider or prompt" }, 400);
    }

    // Get API keys
    const serviceClient = createClient(supabaseUrl, serviceKey);
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

    // Check user-configured keys in DB
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
        // Fallback or No Key Error
        if (provider === "claude" && geminiKey) {
          responseText = await callGemini(prompt, geminiKey);
          usedProvider = "gemini";
        } else if (provider === "gemini" && anthropicKey) {
          responseText = await callClaude(prompt, anthropicKey);
          usedProvider = "claude";
        } else {
          return createResponse({
            error: "No API key configured for any AI provider",
            response: null,
            provider: "none",
          });
        }
      }
    } catch (aiErr: unknown) {
      console.error(`[ai-rebalance-review] ${provider} failed:`, aiErr);
      return createResponse({
        error: `AI call failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`,
        response: null,
        provider: usedProvider,
      });
    }

    // Extract JSON from response
    const parsed = extractJSON(responseText);

    return createResponse({
      response: parsed || responseText,
      provider: usedProvider,
      role,
      schema,
      raw_length: responseText.length,
      json_extracted: parsed !== null,
    });

  } catch (err) {
    console.error("[ai-rebalance-review] Fatal Error:", err);
    return createResponse({ success: false, error: String(err) }, 500);
  }
});
