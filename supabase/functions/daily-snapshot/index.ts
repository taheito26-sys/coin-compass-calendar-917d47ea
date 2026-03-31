import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPositions } from "../_shared/accounting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily Snapshot Engine
 * Takes a snapshot of all user portfolios.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get all users who have active assets/transactions
    // For simplicity, we get all users from transactional data
    const { data: users, error: userError } = await supabase
      .from("transactions")
      .select("user_id")
      .order("user_id");

    if (userError) throw userError;
    const userIds = Array.from(new Set((users || []).map(u => u.user_id)));

    // 2. Map all assets to their current prices
    const { data: prices, error: priceError } = await supabase
      .from("price_cache")
      .select("asset_id, price");

    if (priceError) throw priceError;
    const priceMap = new Map((prices || []).map(p => [p.asset_id, Number(p.price)]));

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const results = [];

    // 3. Process snapshots for each user
    for (const userId of userIds) {
      try {
        const positions = await getPositions(supabase, userId);
        
        let totalMV = 0;
        let totalCost = 0;

        const positionEntries = positions.map(p => {
          const price = priceMap.get(p.asset_id) || 0;
          const mv = p.qty * price;
          totalMV += mv;
          totalCost += p.cost_basis;

          return {
            asset_id: p.asset_id,
            qty: p.qty,
            market_price: price,
            market_value: mv,
            cost_basis: p.cost_basis,
            avg_cost: p.avg_cost
          };
        });

        // Upsert Portfolio Snapshot
        const { data: snapshot, error: snapshotError } = await supabase
          .from("portfolio_snapshots")
          .upsert({
            user_id: userId,
            date: today,
            total_market_value: totalMV,
            total_cost_basis: totalCost,
            realized_pnl: 0, // Should be fetched from accounting engine
            unrealized_pnl: totalMV - totalCost
          }, { onConflict: 'user_id,date' })
          .select()
          .single();

        if (snapshotError) throw snapshotError;

        // Insert Position Snapshots
        const positionSnapshots = positionEntries.map(e => ({
          ...e,
          portfolio_snapshot_id: snapshot.id
        }));

        if (positionSnapshots.length > 0) {
          const { error: posError } = await supabase
            .from("position_snapshots")
            .upsert(positionSnapshots, { onConflict: 'portfolio_snapshot_id,asset_id' });
          
          if (posError) throw posError;
        }

        results.push({ userId, ok: true });
      } catch (err: any) {
        results.push({ userId, ok: false, error: err.message });
      }
    }

    return new Response(JSON.stringify({ date: today, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
