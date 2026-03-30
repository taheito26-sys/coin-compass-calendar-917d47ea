// Symbol normalization and alias mapping for import reconciliation

/** Common exchange symbol aliases → canonical symbol */
const SYMBOL_ALIASES: Record<string, string> = {
  XBT: "BTC",
  BCHABC: "BCH",
  BCHSV: "BSV",
  MIOTA: "IOTA",
  YOYO: "YOYOW",
  BKRW: "KRW",
  IOST: "IOST",
  LUNA2: "LUNA",
  LUNC: "LUNC",
  CGLD: "CELO",
  REP: "REP",
  REPV2: "REP",
  SUSHI: "SUSHI",
  RNDR: "RENDER",
  WBTC: "WBTC",
  STETH: "STETH",
  TON: "TON",
  TONCOIN: "TON",
  ASI: "FET",
  FET: "FET",
  // Add more as needed
};

/** Quote currencies to strip from pair symbols */
const QUOTE_CURRENCIES = [
  "USDT", "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "UST",
  "BTC", "ETH", "BNB", "EUR", "GBP", "TRY", "BRL", "ARS",
  "USD", "PERP",
];

/**
 * Normalize a raw symbol to its canonical form.
 * - Uppercases
 * - Applies known aliases (XBT→BTC, etc.)
 * - Preserves numeric prefixes (e.g., "1INCH") so multiplier handling can be
 *   performed explicitly by instrument normalization logic.
 */
export function normalizeSymbol(raw: string): string {
  let sym = raw.trim().toUpperCase();
  // Apply alias
  if (SYMBOL_ALIASES[sym]) sym = SYMBOL_ALIASES[sym];
  return sym;
}

/**
 * Extract the base asset from a trading pair symbol.
 * e.g., "BTCUSDT" → "BTC", "ETH/USDT" → "ETH", "SOL-PERP" → "SOL"
 */
export function extractBaseFromPair(pair: string): string {
  let s = pair.trim().toUpperCase();
  // Remove -PERP, -SWAP, etc.
  s = s.replace(/[-_](PERP|SWAP|SPOT|MARGIN)$/i, "");
  // Handle slash-separated pairs: "ETH/USDT"
  if (s.includes("/")) {
    s = s.split("/")[0];
    return normalizeSymbol(s);
  }
  // Handle dash-separated pairs: "ETH-USDT"
  if (s.includes("-")) {
    s = s.split("-")[0];
    return normalizeSymbol(s);
  }
  // Strip known quote currencies from the end
  for (const q of QUOTE_CURRENCIES) {
    if (s.length > q.length && s.endsWith(q)) {
      return normalizeSymbol(s.slice(0, -q.length));
    }
  }
  return normalizeSymbol(s);
}

/**
 * Match symbol against an asset list, checking both `symbol` and `binance_symbol`.
 * Returns the asset id or null.
 */
export function matchAssetBySymbol(
  sym: string,
  assets: { id: string; symbol: string; binance_symbol?: string | null }[],
): string | null {
  const normalized = normalizeSymbol(sym);
  for (const a of assets) {
    if (a.symbol.toUpperCase() === normalized) return a.id;
    if (a.binance_symbol && a.binance_symbol.toUpperCase() === normalized) return a.id;
  }
  return null;
}
