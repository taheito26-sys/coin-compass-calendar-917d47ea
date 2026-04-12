import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface HoldingSnapshot {
  symbol: string;
  assetId: string;
  qty: number;
  costBasis: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  pnlAbs: number;
  pnlPct: number;
  weight: number;
}

export interface PortfolioSnapshot {
  userId: string;
  generatedAt: string;
  totalValue: number;
  totalCost: number;
  cashUsdt: number;
  holdings: HoldingSnapshot[];
  allocations: Record<string, number>;
  stablecoinRatio: number;
}

const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"]);

export async function buildPortfolioSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<PortfolioSnapshot> {
  const { data: lots, error: lotsErr } = await supabase
    .from("lots")
    .select("asset_id, remaining_qty, unit_cost, status")
    .eq("user_id", userId)
    .eq("status", "open");

  if (lotsErr) console.warn(`Failed to fetch lots: ${lotsErr.message}`);

  const assetAgg = new Map<string, { qty: number; cost: number }>();
  for (const lot of (lots || [])) {
    const qty = Number(lot.remaining_qty);
    if (qty <= 0) continue;
    const cost = qty * Number(lot.unit_cost);
    const existing = assetAgg.get(lot.asset_id) || { qty: 0, cost: 0 };
    existing.qty += qty;
    existing.cost += cost;
    assetAgg.set(lot.asset_id, existing);
  }

  // Fallback: derive from transactions when lots table is empty
  if (assetAgg.size === 0) {
    console.log("No lots found, falling back to transactions-based derivation");
    const { data: txs, error: txErr } = await supabase
      .from("transactions")
      .select("asset_id, type, qty, unit_price, fee_amount, timestamp")
      .eq("user_id", userId)
      .in("type", ["buy", "sell", "transfer_in", "transfer_out"])
      .order("timestamp", { ascending: true });

    if (txErr) console.warn(`Failed to fetch transactions: ${txErr.message}`);

    for (const tx of (txs || [])) {
      const qty = Number(tx.qty || 0);
      const price = Number(tx.unit_price || 0);
      const fee = Number(tx.fee_amount || 0);
      if (qty <= 0) continue;
      const existing = assetAgg.get(tx.asset_id) || { qty: 0, cost: 0 };

      if (tx.type === "buy" || tx.type === "transfer_in") {
        existing.cost += (qty * price) + fee;
        existing.qty += qty;
      } else if (tx.type === "sell" || tx.type === "transfer_out") {
        const avgCostBefore = existing.qty > 0 ? existing.cost / existing.qty : price;
        const qtySold = Math.min(qty, existing.qty);
        existing.qty -= qtySold;
        existing.cost = Math.max(0, existing.cost - (qtySold * avgCostBefore));
      }

      assetAgg.set(tx.asset_id, existing);
    }

    // Remove zero/negative positions
    for (const [id, agg] of assetAgg) {
      if (agg.qty <= 0.000001) assetAgg.delete(id);
    }
  }

  const assetIds = [...assetAgg.keys()];
  if (assetIds.length === 0) {
    return {
      userId, generatedAt: new Date().toISOString(),
      totalValue: 0, totalCost: 0, cashUsdt: 0,
      holdings: [], allocations: {}, stablecoinRatio: 0,
    };
  }

  const { data: assets } = await supabase
    .from("assets").select("id, symbol, name").in("id", assetIds);
  const assetMap = new Map<string, { symbol: string; name: string }>();
  for (const a of (assets || [])) assetMap.set(a.id, { symbol: a.symbol, name: a.name });

  const { data: prices } = await supabase
    .from("price_cache").select("asset_id, price").in("asset_id", assetIds);
  const priceMap = new Map<string, number>();
  for (const p of (prices || [])) priceMap.set(p.asset_id, Number(p.price));

  const holdings: HoldingSnapshot[] = [];
  let totalValue = 0, totalCost = 0, cashUsdt = 0;

  for (const [assetId, agg] of assetAgg) {
    const meta = assetMap.get(assetId);
    if (!meta) continue;
    const symbol = meta.symbol.toUpperCase();
    const price = STABLECOINS.has(symbol) ? 1 : (priceMap.get(assetId) || 0);
    const marketValue = agg.qty * price;
    const pnlAbs = marketValue - agg.cost;
    const pnlPct = agg.cost > 0 ? (pnlAbs / agg.cost) * 100 : 0;
    if (STABLECOINS.has(symbol)) cashUsdt += marketValue;
    totalValue += marketValue;
    totalCost += agg.cost;
    holdings.push({
      symbol, assetId, qty: agg.qty, costBasis: agg.cost,
      avgCost: agg.qty > 0 ? agg.cost / agg.qty : 0,
      currentPrice: price, marketValue, pnlAbs, pnlPct, weight: 0,
    });
  }

  const allocations: Record<string, number> = {};
  for (const h of holdings) {
    h.weight = totalValue > 0 ? h.marketValue / totalValue : 0;
    allocations[h.symbol] = Math.round(h.weight * 10000) / 100;
  }
  holdings.sort((a, b) => b.marketValue - a.marketValue);

  return {
    userId, generatedAt: new Date().toISOString(),
    totalValue, totalCost, cashUsdt, holdings, allocations,
    stablecoinRatio: totalValue > 0 ? cashUsdt / totalValue : 0,
  };
}
