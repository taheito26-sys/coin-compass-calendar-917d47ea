import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { user_id, snapshots } = await req.json();
  if (!user_id || !snapshots?.length) {
    return new Response(JSON.stringify({ error: "missing user_id or snapshots" }), { status: 400, headers: corsHeaders });
  }

  const rows = snapshots.map((s: any) => ({
    user_id,
    date: s.date,
    total_market_value: s.mv,
    total_cost_basis: s.cost,
    unrealized_pnl: s.mv - s.cost,
    realized_pnl: s.realized || 0,
  }));

  const { error } = await supabase.from("portfolio_snapshots").upsert(rows, { onConflict: "user_id,date" });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true, count: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
