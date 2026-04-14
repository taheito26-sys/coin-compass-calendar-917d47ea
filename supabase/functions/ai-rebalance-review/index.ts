import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-customer-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // 1. Mandatory Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. Wrap everything in header-guaranteed creator
  const respond = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Check Auth
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond({ error: "Invalid User" }, 401);

    const body = await req.json();
    const { provider, prompt, role, schema } = body;

    // Get Keys
    const serviceClient = createClient(supabaseUrl, serviceKey);
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
    let geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

    const { data: userPrefs } = await serviceClient
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", user.id)
      .in("key", ["anthropic_api_key", "gemini_api_key"]);

    if (userPrefs) {
      for (const p of userPrefs) {
        if (p.key === "anthropic_api_key") anthropicKey = p.value;
        if (p.key === "gemini_api_key") geminiKey = p.value;
      }
    }

    let result = "No response generated";
    let usedProvider = provider;

    if (provider === "claude" && anthropicKey) {
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
      result = data.content?.[0]?.text || JSON.stringify(data);
    } else if (provider === "gemini" && geminiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      result = data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
    } else {
      return respond({ error: "Provider key missing" }, 400);
    }

    return respond({
      response: result,
      provider: usedProvider,
      role,
      schema,
    });

  } catch (err: any) {
    console.error("[ai-rebalance-review] Error:", err);
    return respond({ error: err.message }, 500);
  }
});
