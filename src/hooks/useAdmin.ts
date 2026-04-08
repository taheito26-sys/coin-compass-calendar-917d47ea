import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabaseAuth";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useAdmin() {
  const { userId } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(!!data);
        setLoading(false);
      });
  }, [userId]);

  return { isAdmin, loading };
}

export async function fetchAllUsers(): Promise<AdminUser[]> {
  // We query transactions to discover distinct user_ids, since we can't query auth.users
  const { data, error } = await supabase
    .from("transactions")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const userMap = new Map<string, { id: string; earliest: string }>();
  for (const row of data || []) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, { id: row.user_id, earliest: row.created_at || "" });
    }
  }

  // Also check user_preferences for users who might not have transactions
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("user_id");

  for (const row of prefs || []) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, { id: row.user_id, earliest: "" });
    }
  }

  return Array.from(userMap.values()).map((u) => ({
    id: u.id,
    email: "", // We'll try to resolve this differently
    created_at: u.earliest,
    last_sign_in_at: null,
  }));
}

export async function fetchUserTransactions(userId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, assets!transactions_asset_id_fkey(symbol, name, category, binance_symbol, coingecko_id)")
    .eq("user_id", userId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchUserPortfolioSnapshots(userId: string) {
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });

  if (error) throw error;
  return data || [];
}
