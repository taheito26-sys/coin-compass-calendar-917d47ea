/**
 * Trade-event compaction (event-identity first, bias for safety).
 */

export interface NormalizedTrade {
  id: string;
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

  // Event identity candidates (Level 1)
  orderId?: string;
  orderLinkId?: string;
  executionGroupId?: string;
  tradeGroupId?: string;
  parentOrderId?: string;

  // Heuristic guardrails
  connectionId?: string;
  batchId?: string;
  sourceType?: string;
}

export interface CompactionMetadata {
  // Required audit fields
  number_of_fills_merged: number;
  source_trade_ids: string[];
  min_timestamp: string;
  max_timestamp: string;
  min_price: number;
  max_price: number;
  total_fee: number;
  compaction_method: "native_id" | "heuristic";

  // Back-compat aliases
  num_fills: number;
  source_ids: string[];
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
  priceTolerancePercent: number;
  isCsvImport?: boolean;
}

const NATIVE_KEYS: Array<keyof NormalizedTrade> = [
  "orderId",
  "orderLinkId",
  "executionGroupId",
  "tradeGroupId",
  "parentOrderId",
];

function normalizeDay(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function fnv1aHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toNativeIdentity(t: NormalizedTrade): string | null {
  for (const key of NATIVE_KEYS) {
    const value = String(t[key] || "").trim();
    if (value) return `${key}:${value}`;
  }
  return null;
}

function sameFeeCurrency(a?: string, b?: string): boolean {
  return (a || "").trim().toUpperCase() === (b || "").trim().toUpperCase();
}

function withinPriceTolerance(a: number, b: number, tolerancePercent: number): boolean {
  const maxPrice = Math.max(a, b);
  if (maxPrice <= 0) return a === b;
  const diff = Math.abs(a - b) / maxPrice;
  return diff <= tolerancePercent / 100;
}

function canHeuristicCompact(anchor: NormalizedTrade, trade: NormalizedTrade, options: CompactionOptions): boolean {
  if (anchor.symbol !== trade.symbol) return false;
  if (anchor.side !== trade.side) return false;
  if ((anchor.venue || "") !== (trade.venue || "")) return false;
  if ((anchor.connectionId || "") !== (trade.connectionId || "")) return false;
  if ((anchor.batchId || "") !== (trade.batchId || "")) return false;
  if ((anchor.sourceType || "") !== (trade.sourceType || "")) return false;
  if (!sameFeeCurrency(anchor.feeCurrency, trade.feeCurrency)) return false;

  if (normalizeDay(anchor.timestamp) !== normalizeDay(trade.timestamp)) return false;

  const diffSeconds = Math.abs(new Date(anchor.timestamp).getTime() - new Date(trade.timestamp).getTime()) / 1000;
  if (diffSeconds > options.timeWindowSeconds) return false;

  return withinPriceTolerance(anchor.price, trade.price, options.priceTolerancePercent);
}

function buildExternalId(anchor: NormalizedTrade, method: "native_id" | "heuristic", eventIdentity: string, timeWindowSeconds: number): string {
  const venue = (anchor.venue || "unknown").toLowerCase();
  const symbol = (anchor.symbol || "unknown").toUpperCase();
  const side = anchor.side;
  const connection = (anchor.connectionId || "unknown").toLowerCase();
  const anchorMs = new Date(anchor.timestamp).getTime();
  const bucket = Number.isFinite(anchorMs)
    ? String(Math.floor(anchorMs / (timeWindowSeconds * 1000)))
    : "0";

  if (method === "native_id") {
    return `evt:${venue}:${symbol}:${side}:${connection}:${eventIdentity}:${bucket}`;
  }

  const digest = fnv1aHash([
    venue,
    symbol,
    side,
    connection,
    eventIdentity,
    bucket,
  ].join("|"));
  return `evt:${venue}:${symbol}:${side}:${connection}:h:${digest}:${bucket}`;
}

export function compactTrades(
  trades: NormalizedTrade[],
  options: CompactionOptions = { timeWindowSeconds: 60, priceTolerancePercent: 0.15 }
): { trades: CompactedTrade[]; summary: CompactionSummary } {
  if (trades.length === 0) {
    return {
      trades: [],
      summary: { raw_trades: 0, compacted_trades: 0, skipped_trades: 0, duplicate_trades: 0 },
    };
  }

  const sorted = [...trades].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const groups: CompactedTrade[][] = [];

  for (const trade of sorted) {
    const tradeNativeIdentity = toNativeIdentity(trade);
    let target: CompactedTrade[] | null = null;

    for (const group of groups) {
      const anchor = group[0];
      const anchorNativeIdentity = toNativeIdentity(anchor);

      // Level 1 (preferred): strict native identity match + exchange/account safety.
      if (tradeNativeIdentity || anchorNativeIdentity) {
        if (
          tradeNativeIdentity &&
          anchorNativeIdentity &&
          tradeNativeIdentity === anchorNativeIdentity &&
          (anchor.venue || "") === (trade.venue || "") &&
          (anchor.connectionId || "") === (trade.connectionId || "")
        ) {
          target = group;
          break;
        }
        continue;
      }

      // Level 2 fallback only when both trades have no native identity.
      if (canHeuristicCompact(anchor, trade, options)) {
        target = group;
        break;
      }
    }

    if (target) target.push(trade as CompactedTrade);
    else groups.push([trade as CompactedTrade]);
  }

  const compacted = groups.map((group) => {
    if (group.length === 1) return group[0];

    const totalQty = group.reduce((sum, t) => sum + t.qty, 0);
    const totalValue = group.reduce((sum, t) => sum + t.qty * t.price, 0);
    const totalFee = group.reduce((sum, t) => sum + t.fee, 0);
    const timestamps = group.map((t) => new Date(t.timestamp).getTime());
    const prices = group.map((t) => t.price);

    const earliestTs = new Date(Math.min(...timestamps)).toISOString();
    const latestTs = new Date(Math.max(...timestamps)).toISOString();

    const anchor = group[0];
    const nativeIdentity = toNativeIdentity(anchor);
    const method: "native_id" | "heuristic" = nativeIdentity ? "native_id" : "heuristic";
    const heuristicIdentity = [
      anchor.venue || "",
      anchor.symbol,
      anchor.side,
      anchor.connectionId || "",
      anchor.batchId || "",
      anchor.sourceType || "",
      normalizeDay(anchor.timestamp),
      (anchor.feeCurrency || "").toUpperCase(),
    ].join("|");
    const eventIdentity = nativeIdentity || `heuristic:${fnv1aHash(heuristicIdentity)}`;

    const metadata: CompactionMetadata = {
      number_of_fills_merged: group.length,
      source_trade_ids: group.map((t) => t.id).filter(Boolean),
      min_timestamp: earliestTs,
      max_timestamp: latestTs,
      min_price: Math.min(...prices),
      max_price: Math.max(...prices),
      total_fee: totalFee,
      compaction_method: method,

      num_fills: group.length,
      source_ids: group.map((t) => t.id).filter(Boolean),
      method,
    };

    return {
      ...anchor,
      qty: totalQty,
      price: totalQty > 0 ? totalValue / totalQty : anchor.price,
      fee: totalFee,
      timestamp: earliestTs,
      external_id: buildExternalId(anchor, method, eventIdentity, options.timeWindowSeconds),
      compaction_metadata: metadata,
    };
  });

  const skipped = groups.filter((g) => g.length === 1).length;

  return {
    trades: compacted,
    summary: {
      raw_trades: sorted.length,
      compacted_trades: compacted.length,
      skipped_trades: skipped,
      duplicate_trades: 0,
    },
  };
}
