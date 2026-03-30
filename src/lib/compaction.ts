/**
 * compaction.ts
 * 
 * High-precision Trade-Event Compaction module.
 * Consolidates micro-fills into logical trade events based on:
 * Level 1: Native Exchange IDs (order_id, etc.)
 * Level 2: Deterministic Heuristics (time, symbol, side, price tolerance)
 */

export interface NormalizedTrade {
  id: string; // Internal unique ID or native ID
  orderId?: string;
  symbol: string;
  side: "buy" | "sell" | "transfer_in" | "transfer_out";
  qty: number;
  price: number;
  fee: number;
  feeCurrency?: string;
  timestamp: string;
  venue?: string;
  source?: string;
  external_id?: string;
  fingerprint_hash?: string;
}

export interface CompactionMetadata {
  num_fills: number;
  source_ids: string[];
  min_timestamp: string;
  max_timestamp: string;
  min_price: number;
  max_price: number;
  total_fee: number;
  method: "native_id" | "heuristic";
}

export interface CompactedTrade extends NormalizedTrade {
  compaction_metadata?: CompactionMetadata;
}

export interface CompactionSummary {
  raw_trades: number;
  compacted_trades: number;
  skipped_trades: number;
  duplicate_trades: number;
}

export interface CompactionOptions {
  timeWindowSeconds: number;
  priceTolerancePercent: number; // e.g. 0.15
  isCsvImport?: boolean;
}

/**
 * Compacts a list of trades into logical events.
 * deterministic heuristic grouping is only used if Level 1 native IDs are missing.
 */
export function compactTrades(
  trades: NormalizedTrade[],
  options: CompactionOptions = { timeWindowSeconds: 60, priceTolerancePercent: 0.15 }
): { trades: CompactedTrade[]; summary: CompactionSummary } {
  if (trades.length === 0) {
    return { 
      trades: [], 
      summary: { raw_trades: 0, compacted_trades: 0, skipped_trades: 0, duplicate_trades: 0 } 
    };
  }

  // 1. Sort by timestamp ascending for stable processing
  const sorted = [...trades].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const rawCount = sorted.length;
  const groups: CompactedTrade[][] = [];

  // Grouping helper
  const findTargetGroup = (trade: NormalizedTrade): CompactedTrade[] | null => {
    // Level 1: Native Identity
    const nativeId = trade.orderId;
    if (nativeId) {
      for (const group of groups) {
        if (group[0].orderId === nativeId && group[0].venue === trade.venue) {
          return group;
        }
      }
    }

    // Level 2: Deterministic Heuristic
    // Must match ALL conditions per requirement
    const tradeTs = new Date(trade.timestamp).getTime();
    const tradeDateStr = new Date(trade.timestamp).toISOString().split("T")[0];

    for (const group of groups) {
      const anchor = group[0];
      const anchorTs = new Date(anchor.timestamp).getTime();
      const anchorDateStr = new Date(anchor.timestamp).toISOString().split("T")[0];

      // Absolute non-compact conditions
      if (anchor.symbol !== trade.symbol) continue;
      if (anchor.side !== trade.side) continue;
      if (anchor.venue !== trade.venue) continue;
      if (anchor.feeCurrency !== trade.feeCurrency) continue;
      if (anchorDateStr !== tradeDateStr) continue; // Same calendar date rule

      // Time window rule
      const diffSeconds = Math.abs(tradeTs - anchorTs) / 1000;
      if (diffSeconds > options.timeWindowSeconds) continue;

      // Price tolerance rule: abs(priceA - priceB) / max(priceA, priceB) <= threshold
      const maxPrice = Math.max(anchor.price, trade.price);
      if (maxPrice > 0) {
        const priceDiff = Math.abs(anchor.price - trade.price) / maxPrice;
        if (priceDiff > (options.priceTolerancePercent / 100)) continue;
      }

      // If we got here, it's a match for Level 2
      // But only if neither has a native ID or they both have the same native ID
      // (Actually, if they had the same native ID we would have caught it in Level 1)
      // Per hierarchy: Only use Level 2 if Level 1 is missing
      if (!trade.orderId && !anchor.orderId) {
        return group;
      }
    }

    return null;
  };

  for (const trade of sorted) {
    const group = findTargetGroup(trade);
    if (group) {
      group.push(trade as CompactedTrade);
    } else {
      groups.push([trade as CompactedTrade]);
    }
  }

  // 2. Reduce groups into single compacted trades
  const result: CompactedTrade[] = groups.map(group => {
    if (group.length === 1) return group[0];

    const totalQty = group.reduce((sum, t) => sum + t.qty, 0);
    const totalValue = group.reduce((sum, t) => sum + (t.qty * t.price), 0);
    const totalFee = group.reduce((sum, t) => sum + t.fee, 0);
    const avgPrice = totalQty > 0 ? totalValue / totalQty : group[0].price;

    const timestamps = group.map(t => new Date(t.timestamp).getTime());
    const prices = group.map(t => t.price);

    const earliestTs = new Date(Math.min(...timestamps)).toISOString();
    const latestTs = new Date(Math.max(...timestamps)).toISOString();

    const metadata: CompactionMetadata = {
      num_fills: group.length,
      source_ids: group.map(t => t.id).filter(Boolean) as string[],
      min_timestamp: earliestTs,
      max_timestamp: latestTs,
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
      total_fee: totalFee,
      method: group[0].orderId ? "native_id" : "heuristic"
    };

    // Build deterministic external_id if Level 2 or no native ID
    let finalExternalId = group[0].orderId || group[0].external_id;
    if (!finalExternalId) {
      // Deterministic hash of grouping fields
      const anchor = group[0];
      const dateStr = new Date(anchor.timestamp).toISOString().split("T")[0];
      // Time bucket anchor (rounded to window) to ensure stability
      const ts = new Date(anchor.timestamp).getTime();
      const bucket = Math.floor(ts / (options.timeWindowSeconds * 1000));
      
      finalExternalId = `compact_${anchor.venue}_${anchor.symbol}_${anchor.side}_${dateStr}_${bucket}`;
    }

    return {
      ...group[0],
      qty: totalQty,
      price: avgPrice,
      fee: totalFee,
      timestamp: earliestTs,
      external_id: finalExternalId,
      compaction_metadata: metadata
    };
  });

  return {
    trades: result,
    summary: {
      raw_trades: rawCount,
      compacted_trades: result.length,
      skipped_trades: 0, 
      duplicate_trades: 0, // Deduplication happens later in pipeline
    }
  };
}
