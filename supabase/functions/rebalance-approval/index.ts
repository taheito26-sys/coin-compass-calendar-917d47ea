/**
 * rebalance-approval — Backend handler for user approval actions.
 *
 * Persists approval decisions and updates action statuses.
 * No auto-execution: only status changes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ApprovalType =
  | "save_review"
  | "approve_trims_only"
  | "approve_trims_park"
  | "approve_full"
  | "reject";

const STATUS_MAP: Record<ApprovalType, string> = {
  save_review: "analysis_complete",
  approve_trims_only: "approved_trims_only",
  approve_trims_park: "approved_trims_park",
  approve_full: "approved_full",
  reject: "rejected",
};

const APPROVED_ACTIONS: Record<ApprovalType, Set<string>> = {
  save_review: new Set(),
  approve_trims_only: new Set(["trim"]),
  approve_trims_park: new Set(["trim", "park_usdt"]),
  approve_full: new Set(["trim", "park_usdt", "replace_candidate_review"]),
  reject: new Set(),
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

    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { runId, approval } = body as {
      runId: string;
      approval: ApprovalType;
    };

    if (!runId || !approval || !STATUS_MAP[approval]) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid runId/approval" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Verify run belongs to user
    const { data: run, error: runErr } = await sb
      .from("rebalance_runs")
      .select("id, user_id")
      .eq("id", runId)
      .single();

    if (runErr || !run || run.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Run not found or unauthorized" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update run status
    const newStatus = STATUS_MAP[approval];
    await sb
      .from("rebalance_runs")
      .update({ status: newStatus })
      .eq("id", runId);

    // Update action statuses
    if (approval === "reject") {
      await sb
        .from("rebalance_actions")
        .update({ status: "rejected" })
        .eq("run_id", runId);
    } else if (approval !== "save_review") {
      const approvedTypes = APPROVED_ACTIONS[approval];
      const { data: actions } = await sb
        .from("rebalance_actions")
        .select("id, action")
        .eq("run_id", runId);

      if (actions) {
        for (const action of actions) {
          const newActionStatus = approvedTypes.has(action.action)
            ? "approved"
            : "proposed";
          await sb
            .from("rebalance_actions")
            .update({ status: newActionStatus })
            .eq("id", action.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        runId,
        approval,
        newStatus,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[rebalance-approval] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
