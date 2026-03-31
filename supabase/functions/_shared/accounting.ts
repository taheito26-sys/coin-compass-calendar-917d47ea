import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface Lot {
  id?: string;
  user_id: string;
  transaction_id: string;
  asset_id: string;
  qty: number;
  remaining_qty: number;
  unit_cost: number;
  acquired_at: string;
  status: 'open' | 'consumed';
}

export interface Transaction {
  id: string;
  user_id: string;
  asset_id: string;
  timestamp: string;
  type: string;
  qty: number;
  unit_price: number;
  fee_amount: number;
  fee_currency?: string;
}

const IN_TYPES = new Set(["buy", "reward", "transfer_in", "deposit", "adjustment_in"]);
const OUT_TYPES = new Set(["sell", "transfer_out", "withdrawal", "fee", "adjustment_out"]);

/**
 * Re-calculates lots for a specific user and asset.
 * This ensures the lots table is consistent with the transactions table.
 */
export async function recalculateLots(
  supabase: SupabaseClient,
  userId: string,
  assetId: string
) {
  // 1. Fetch all transactions for this user and asset, ordered by timestamp
  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .order("timestamp", { ascending: true });

  if (txError) throw txError;
  if (!txs) return;

  // 2. Run FIFO logic
  const openLots: Lot[] = [];
  let realizedPnl = 0;

  for (const tx of txs) {
    const type = tx.type.toLowerCase();
    const qty = Math.abs(tx.qty);
    
    if (qty <= 0) continue;

    if (IN_TYPES.has(type)) {
      // Create a new lot
      const buyLike = type === "buy" || type === "reward";
      const totalCost = buyLike 
        ? (qty * tx.unit_price) + (tx.fee_amount || 0)
        : qty * Math.max(tx.unit_price, 0);
      
      const unitCost = qty > 0 ? totalCost / qty : 0;

      openLots.push({
        user_id: userId,
        transaction_id: tx.id,
        asset_id: assetId,
        qty: qty,
        remaining_qty: qty,
        unit_cost: unitCost,
        acquired_at: tx.timestamp,
        status: 'open'
      });
    } else if (OUT_TYPES.has(type)) {
      // Consume existing lots FIFO
      let remainingToConsume = qty;
      let costConsumed = 0;

      for (const lot of openLots) {
        if (remainingToConsume <= 0) break;
        if (lot.remaining_qty <= 0) continue;

        const take = Math.min(lot.remaining_qty, remainingToConsume);
        costConsumed += take * lot.unit_cost;
        lot.remaining_qty -= take;
        remainingToConsume -= take;

        if (lot.remaining_qty <= 0) {
          lot.status = 'consumed';
        }
      }

      if (type === "sell") {
        const proceeds = (qty * tx.unit_price) - (tx.fee_amount || 0);
        realizedPnl += (proceeds - costConsumed);
      }
    }
  }

  // 3. Atomically update the lots table (Delete old lots, insert new ones)
  // For safety, we wrap this in a transaction if possible, or just delete and insert.
  // Note: Since this is likely called from an Edge Function, we'll do it sequentially.
  
  const { error: deleteError } = await supabase
    .from("lots")
    .delete()
    .eq("user_id", userId)
    .eq("asset_id", assetId);

  if (deleteError) throw deleteError;

  if (openLots.length > 0) {
    const { error: insertError } = await supabase
      .from("lots")
      .insert(openLots);

    if (insertError) throw insertError;
  }

  return { realizedPnl, openLots: openLots.filter(l => l.status === 'open') };
}

/**
 * Derives current positions for a user based on the lots table.
 */
export async function getPositions(supabase: SupabaseClient, userId: string) {
  const { data: lots, error } = await supabase
    .from("lots")
    .select("asset_id, remaining_qty, unit_cost")
    .eq("user_id", userId)
    .eq("status", "open");

  if (error) throw error;

  const positionsMap = new Map<string, { qty: number; cost: number }>();

  for (const lot of (lots || [])) {
    const assetId = lot.asset_id;
    const existing = positionsMap.get(assetId) || { qty: 0, cost: 0 };
    existing.qty += Number(lot.remaining_qty);
    existing.cost += Number(lot.remaining_qty) * Number(lot.unit_cost);
    positionsMap.set(assetId, existing);
  }

  return Array.from(positionsMap.entries()).map(([assetId, data]) => ({
    asset_id: assetId,
    qty: data.qty,
    cost_basis: data.cost,
    avg_cost: data.qty > 0 ? data.cost / data.qty : 0
  }));
}
