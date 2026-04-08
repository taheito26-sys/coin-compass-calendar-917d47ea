import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabaseAuth";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser {
  id: string;
  created_at: string;
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

/** Discover all users who have data in the system (admin only — requires admin RLS policies) */
export async function fetchAllUsers(): Promise<AdminUser[]> {
  // Collect distinct user_ids from transactions
  const { data: txData } = await supabase
    .from("transactions")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });

  const userMap = new Map<string, string>();
  for (const row of txData || []) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, row.created_at || "");
    }
  }

  // Also check user_preferences for users without transactions
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("user_id");

  for (const row of prefs || []) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, "");
    }
  }

  return Array.from(userMap.entries()).map(([id, created_at]) => ({
    id,
    created_at,
  }));
}
