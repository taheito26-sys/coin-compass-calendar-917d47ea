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
  assetId: string,
  method: string = 'FIFO',
  dryRun: boolean = false
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

  // 2. Process transactions
  let openLots: Lot[] = [];
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
      // Consume existing lots based on method
      let remainingToConsume = qty;
      let costConsumed = 0;

      // Sort open lots based on accounting method
      const lotsToConsume = [...openLots].filter(l => l.remaining_qty > 0);
      
      if (method === 'LIFO') {
        lotsToConsume.sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime());
      } else if (method === 'HIFO') {
        lotsToConsume.sort((a, b) => b.unit_cost - a.unit_cost);
      } else if (method === 'AVCO') {
        // Average cost: calculate total average and consume proportionally
        const totalQty = lotsToConsume.reduce((s, l) => s + l.remaining_qty, 0);
        const totalCost = lotsToConsume.reduce((s, l) => s + l.remaining_qty * l.unit_cost, 0);
        const avgUnitCost = totalQty > 0 ? totalCost / totalQty : 0;
        
        // In AVCO, we consume based on the average unit cost at that exact moment
        for (const lot of openLots) {
          if (remainingToConsume <= 0) break;
          if (lot.remaining_qty <= 0) continue;
          const take = Math.min(lot.remaining_qty, remainingToConsume);
          costConsumed += take * avgUnitCost;
          lot.remaining_qty -= take;
          remainingToConsume -= take;
          if (lot.remaining_qty <= 0) lot.status = 'consumed';
        }
      } else {
        // Default: FIFO (already sorted by acquired_at because openLots preserves push order)
        // No explicit sort needed, but let's be safe
        lotsToConsume.sort((a, b) => new Date(a.acquired_at).getTime() - new Date(b.acquired_at).getTime());
      }

      if (method !== 'AVCO') {
        for (const lot of lotsToConsume) {
          if (remainingToConsume <= 0) break;
          const take = Math.min(lot.remaining_qty, remainingToConsume);
          costConsumed += take * lot.unit_cost;
          
          // Find the original lot in openLots to update it
          const originalLot = openLots.find(l => l.transaction_id === lot.transaction_id);
          if (originalLot) {
            originalLot.remaining_qty -= take;
            if (originalLot.remaining_qty <= 0) originalLot.status = 'consumed';
          }
          remainingToConsume -= take;
        }
      }

      if (type === "sell") {
        const proceeds = (qty * tx.unit_price) - (tx.fee_amount || 0);
        realizedPnl += (proceeds - costConsumed);
      }
    }
  }

  // 3. Persist to DB only if not a dry run
  if (!dryRun) {
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
  }

  return { realizedPnl, openLots: openLots.filter(l => l.status === 'open') };
}

/**
 * Compares total cost basis across all methods for a specific user and asset.
 */
export async function compareMethods(
  supabase: SupabaseClient,
  userId: string,
  assetId: string
) {
  const methods = ['FIFO', 'LIFO', 'HIFO', 'AVCO'];
  const results: Record<string, { costBasis: number; realizedPnl: number }> = {};

  for (const m of methods) {
    const res = await recalculateLots(supabase, userId, assetId, m, true);
    
    // Calculate total cost basis of remaining lots
    const costBasis = (res?.openLots || []).reduce((s: number, l: any) => s + (Number(l.remaining_qty) * Number(l.unit_cost)), 0);
    results[m] = { 
      costBasis, 
      realizedPnl: res?.realizedPnl ?? 0 
    };
  }

  return results;
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

/**
 * Calculates risk metrics (Max Drawdown, Volatility, Session P&L) for a user.
 */
export async function getRiskMetrics(supabase: SupabaseClient, userId: string) {
  // 1. Fetch historical snapshots ordered by date
  const { data: snapshots, error } = await supabase
    .from("portfolio_snapshots" as any)
    .select("date, total_market_value")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) throw error;
  if (!snapshots || snapshots.length === 0) {
    return { maxDrawdown: 0, sessionPnl: 0, peakValue: 0 };
  }

  // 2. Max Drawdown logic
  let peak = -Infinity;
  let maxDrawdown = 0;
  
  for (const s of snapshots) {
    const val = Number(s.total_market_value);
    if (val > peak) peak = val;
    const drawdown = peak > 0 ? (val - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  // 3. Session P&L (Today vs Yesterday)
  const current = Number(snapshots[snapshots.length - 1].total_market_value);
  const previous = snapshots.length > 1 ? Number(snapshots[snapshots.length - 2].total_market_value) : current;
  const sessionPnl = current - previous;
  const sessionPnlPct = previous > 0 ? (sessionPnl / previous) * 100 : 0;

  return { peakValue: peak, maxDrawdown: Math.abs(maxDrawdown), sessionPnl, sessionPnlPct };
}
