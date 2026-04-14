import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-customer-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Standard responder with CORS
 */
function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify User
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("[ai-rebalance-review] Auth failed:", userError);
      return respond({ error: "Unauthorized: " + (userError?.message || "Invalid session") }, 401);
    }

    const body = await req.json();
    const { provider, prompt, role, schema } = body;

    if (!provider || !prompt) {
      return respond({ error: "Missing provider or prompt in request body" }, 400);
    }

    // Resolve API Keys
    const serviceClient = createClient(supabaseUrl, serviceKey);
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

    // Try to get user-specific keys first
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

    // Call AI
    let responseText = "";
    let usedProvider = provider;

    if (provider === "claude") {
      if (!anthropicKey) return respond({ error: "Anthropic API key not configured" }, 400);
      
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      responseText = data.content?.[0]?.text || "";
      if (!res.ok) {
        console.error("[ai-rebalance-review] Claude Error:", data);
        return respond({ 
          error: "Claude API Error", 
          upstream_status: res.status, 
          details: data 
        }, 400);
      }
    } 
    else if (provider === "gemini") {
      if (!geminiKey) return respond({ error: "Gemini API key not configured" }, 400);

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("[ai-rebalance-review] Gemini Error:", data);
        return respond({ 
          error: "Gemini API Error", 
          upstream_status: res.status, 
          details: data 
        }, 400);
      }
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } 
    else {
      return respond({ error: `Unsupported provider: ${provider}` }, 400);
    }

    if (!responseText) {
      return respond({ error: "AI returned an empty response" }, 500);
    }

    // Success
    return respond({
      response: responseText,
      provider: usedProvider,
      role,
      schema,
      raw_length: responseText.length
    });

  } catch (err: any) {
    console.error("[ai-rebalance-review] Fatal:", err);
    return respond({ error: "Internal Server Error", message: err.message }, 500);
  }
});
