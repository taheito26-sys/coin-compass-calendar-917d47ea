import type { DetectionCandidate, DetectionResult, Exchange } from "./types";

// Known header signatures for spot trade history exports
const SIGNATURES: { exchange: Exchange; exportType: string; required: string[] }[] = [
  // Binance Spot Trade History
  { exchange: "binance", exportType: "Spot Trade History", required: ["Date(UTC)", "Pair", "Side", "Price"] },
  // Binance alternate format (older)
  { exchange: "binance", exportType: "Spot Trade History", required: ["Date(UTC)", "Market", "Type", "Price", "Amount", "Total", "Fee", "Fee Coin"] },

  // Bybit Spot Trade History (UTA)
  { exchange: "bybit", exportType: "Spot Trade History", required: ["Symbol", "Side", "TradeTime"] },
  { exchange: "bybit", exportType: "Spot Trade History", required: ["Symbol", "Side", "Trading Time"] },

  // OKX Trading History
  { exchange: "okx", exportType: "Trading History", required: ["Instrument ID"] },
  { exchange: "okx", exportType: "Trading History", required: ["instrument_id"] },

  // Gate.io Spot Trade History
  { exchange: "gate", exportType: "Spot Trade History", required: ["pair"] },
  { exchange: "gate", exportType: "Spot Trade History", required: ["Pair", "Side"] },

  // MEXC Spot Trade History
  { exchange: "mexc", exportType: "Spot Trade History", required: ["Pairs", "Side"] },
  { exchange: "mexc", exportType: "Spot Trade History", required: ["Trading Pair", "Direction"] },

  // KuCoin Spot Trade History
  { exchange: "kucoin", exportType: "Spot Trade History", required: ["tradeCreatedAt", "symbol", "side"] },
  { exchange: "kucoin", exportType: "Spot Trade History", required: ["Symbol", "Side", "Trade Time"] },
];

// Headers that indicate a NON-spot export (reject these)
const REJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /futures|perpetual|perp|swap/i, reason: "Futures/Perpetual exports are not supported" },
  { pattern: /margin/i, reason: "Margin trading exports are not supported" },
  { pattern: /option/i, reason: "Options trading exports are not supported" },
  { pattern: /earn|staking|savings/i, reason: "Earn/Staking exports are not supported" },
  { pattern: /p2p/i, reason: "P2P trading exports are not supported" },
  { pattern: /copy.?trad/i, reason: "Copy trading exports are not supported" },
  { pattern: /deposit|withdrawal|withdraw/i, reason: "Deposit/Withdrawal history is not supported (spot trades only)" },
  { pattern: /funding/i, reason: "Funding history is not supported" },
  { pattern: /billing/i, reason: "Billing history is not supported" },
];

export function detectExchange(headers: string[], firstRows: Record<string, string>[]): DetectionResult {
  const cleanedHeaders = headers.map((h) => String(h ?? "").replace(/^\uFEFF/, "").trim());
  const headerStr = cleanedHeaders.join(" ");

  for (const { pattern, reason } of REJECTION_PATTERNS) {
    if (pattern.test(headerStr)) {
      return {
        detected: false,
        exchange: null,
        exportType: null,
        confidence: 0,
        candidates: [],
        rejected: true,
        rejectionReason: reason,
      };
    }
  }

  // Row-level rejection hints (OKX instType in rows)
  for (const row of firstRows.slice(0, 5)) {
    const vals = Object.values(row).join(" ");
    if (/SWAP|FUTURES|OPTION|MARGIN/i.test(vals)) {
      if (row["Instrument Type"] && /SWAP|FUTURES|OPTION/i.test(row["Instrument Type"])) {
        return {
          detected: false,
          exchange: null,
          exportType: null,
          confidence: 0,
          candidates: [],
          rejected: true,
          rejectionReason: "Non-spot instrument type detected: " + row["Instrument Type"],
        };
      }
    }
  }

  // Candidate scoring (case-insensitive)
  const headerSetLower = new Set(cleanedHeaders.map((h) => h.toLowerCase()));

  const candidates: DetectionCandidate[] = SIGNATURES.map((sig) => {
    const requiredLower = sig.required.map((r) => r.toLowerCase());
    const matched = requiredLower.filter((r) => headerSetLower.has(r)).length;
    const confidence = sig.required.length > 0 ? matched / sig.required.length : 0;
    return { exchange: sig.exchange, exportType: sig.exportType, confidence };
  })
    .filter((c) => c.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0] ?? null;
  const detected = !!best && best.confidence >= 0.9;

  return {
    detected,
    exchange: best?.exchange ?? null,
    exportType: best?.exportType ?? null,
    confidence: best?.confidence ?? 0,
    candidates,
    rejected: !best,
    rejectionReason: best
      ? detected
        ? null
        : "Low confidence detection — please confirm exchange"
      : "No supported exchange format detected. Supported: Binance, Bybit, OKX, Gate.io, MEXC, KuCoin spot trade exports.",
  };
}
