import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { recalculateLots, getPositions, compareMethods, getRiskMetrics } from "../_shared/accounting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean)[1]; // /accounting/:action

    switch (path) {
      case "recalculate": {
        const { assetId, method } = await req.json();
        if (!assetId) return json({ error: "Missing assetId" }, 400);
        
        const result = await recalculateLots(supabase, user.id, assetId, method);
        return json({ ok: true, ...result });
      }

      case "recalculate-all": {
        const { method } = await req.json();
        // Find all assets for this user
        const { data: assets } = await supabase
          .from("transactions")
          .select("asset_id")
          .eq("user_id", user.id);
        
        const assetIds = Array.from(new Set((assets || []).map(a => a.asset_id)));
        const results = [];

        for (const id of assetIds) {
          try {
            await recalculateLots(supabase, user.id, id, method);
            results.push({ assetId: id, ok: true });
          } catch (err: any) {
            results.push({ assetId: id, ok: false, error: err.message });
          }
        }

        return json({ ok: true, results });
      }

      case "positions": {
        const positions = await getPositions(supabase, user.id);
        return json({ ok: true, positions });
      }

      case "portfolio-value": {
        const positions = await getPositions(supabase, user.id);
        
        // Fetch prices
        const { data: prices } = await supabase
          .from("price_cache")
          .select("asset_id, price");
        
        const priceMap = new Map((prices || []).map(p => [p.asset_id, Number(p.price)]));
        
        let totalValue = 0;
        let totalCost = 0;

        for (const p of positions) {
          const price = priceMap.get(p.asset_id) || 0;
          totalValue += p.qty * price;
          totalCost += p.cost_basis;
        }

        return json({ 
          ok: true, 
          total_market_value: totalValue, 
          total_cost_basis: totalCost,
          unrealized_pnl: totalValue - totalCost
        });
      }

      case "compare-methods": {
        const { assetId } = await req.json();
        if (!assetId) return json({ error: "Missing assetId" }, 400);
        const comparison = await compareMethods(supabase, user.id, assetId);
        return json({ ok: true, comparison });
      }

      case "risk-metrics": {
        const result = await getRiskMetrics(supabase, user.id);
        return json({ ok: true, ...result });
      }

      default:
        return json({ error: "Not found" }, 404);
    }
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});
