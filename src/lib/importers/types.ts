// ── Import system types ──────────────────────────────────────────
// v2: Production-grade spot trade import pipeline.

export type Exchange = "binance" | "bybit" | "okx" | "gate" | "mexc" | "kucoin";

export type ImportRowStatus = "new" | "alreadyImported" | "warning" | "invalid" | "conflict";

export interface DetectionCandidate {
  exchange: Exchange;
  exportType: string;
  confidence: number; // 0..1
}

export interface DetectionResult {
  detected: boolean;
  exchange: Exchange | null; // best guess (even when detected=false)
  exportType: string | null;
  confidence: number; // confidence for best guess
  candidates: DetectionCandidate[];
  rejected: boolean;
  rejectionReason: string | null;
}

/** Adapter-level parsed row (still exchange-shaped, but structured). */
export interface NormalizedRow {
  sourceRowIndex: number; // 0-based index in CSV data rows
  timestamp: number; // unix ms
  exchange: Exchange;
  symbol: string; // e.g. BTCUSDT
  side: "buy" | "sell";
  qty: number;
  unitPrice: number;
  grossValue: number;
  feeAmount: number;
  feeAsset: string;

  // Exchange-native IDs when present
  tradeId: string;
  orderId: string;
  txHash: string;

  // Back-compat: some adapters still map their best ID here
  externalId: string;

  raw: Record<string, string>; // original CSV row
}

/** Canonical internal transaction schema for import preview + persistence mapping. */
export interface CanonicalTransactionRow {
  sourceExchange: Exchange;
  sourceExportType: string;
  sourceRowIndex: number;

  timestamp: number; // unix ms
  type: "trade"; // v2 supports spot trades (extensions later)
  side: "buy" | "sell";

  assetSymbol: string; // full pair/symbol, normalized (e.g. BTCUSDT)
  baseAsset: string; // e.g. BTC
  quoteAsset: string; // e.g. USDT

  qty: number;
  price: number;
  grossValue: number;

  feeAmount: number;
  feeAsset: string;

  orderId: string;
  tradeId: string;
  txHash: string;

  rawRow: Record<string, string>;
}

export interface ImportPreviewRow extends CanonicalTransactionRow {
  // Deterministic fingerprint (priority: tradeId/orderId/txHash else composite)
  fingerprint: string;
  fingerprintHash: string; // sha256(fingerprint)
  nativeId: string | null; // tradeId/orderId/txHash

  status: ImportRowStatus;
  message: string | null;
}

export interface SkippedRow {
  line: number; // 1-indexed CSV line number (including header)
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  detection: DetectionResult;
  exchange: Exchange;
  exportType: string;
  rows: ImportPreviewRow[];
  warnings: string[];
  dateRange: [number, number] | null;
  rowCount: number;
  skippedCount: number;
  contentHash: string;
}

export interface ImportFile {
  name: string;
  hash: string;
  importedAt: number;
  exchange: Exchange;
  exportType: string;
  rowCount: number;
}
