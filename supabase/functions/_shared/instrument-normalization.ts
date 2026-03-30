export interface ParsedInstrumentSymbol {
  rawSymbol: string;
  canonicalSymbol: string;
  multiplier: number;
  hadMultiplier: boolean;
}

export interface NormalizedEconomics {
  canonicalQty: number;
  canonicalPrice: number;
  canonicalGrossValue: number;
  invariantDelta: number;
  invariantHolds: boolean;
}

const MULTIPLIER_PREFIX_RE = /^\d+/;
export const INSTRUMENT_INVARIANT_TOLERANCE = 1e-8;

export function parseInstrumentSymbol(symbol: string): ParsedInstrumentSymbol {
  const rawSymbol = String(symbol || "").trim().toUpperCase();
  const match = rawSymbol.match(MULTIPLIER_PREFIX_RE);
  const parsedMultiplier = match ? Number(match[0]) : 1;
  const multiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 1 ? parsedMultiplier : 1;
  const canonicalSymbol = match ? rawSymbol.slice(match[0].length) : rawSymbol;

  return {
    rawSymbol,
    canonicalSymbol: canonicalSymbol || rawSymbol,
    multiplier,
    hadMultiplier: multiplier > 1,
  };
}

export function normalizeTradeEconomics(rawQty: number, rawPrice: number, multiplier: number): NormalizedEconomics {
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
  const canonicalQty = safeMultiplier > 1 ? rawQty * safeMultiplier : rawQty;
  const canonicalPrice = safeMultiplier > 1 ? rawPrice / safeMultiplier : rawPrice;
  const canonicalGrossValue = canonicalQty * canonicalPrice;
  const invariantDelta = Math.abs(rawQty * rawPrice - canonicalGrossValue);

  return {
    canonicalQty,
    canonicalPrice,
    canonicalGrossValue,
    invariantDelta,
    invariantHolds: invariantDelta < INSTRUMENT_INVARIANT_TOLERANCE,
  };
}
