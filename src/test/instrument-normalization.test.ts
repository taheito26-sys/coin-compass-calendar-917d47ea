import { describe, expect, it } from "vitest";
import { normalizeTradeEconomics, parseInstrumentSymbol } from "@/lib/instrumentNormalization";

describe("instrument normalization", () => {
  it("parses multiplier-prefixed instruments", () => {
    expect(parseInstrumentSymbol("1000PEPE")).toEqual({
      rawSymbol: "1000PEPE",
      canonicalSymbol: "PEPE",
      multiplier: 1000,
      hadMultiplier: true,
    });
  });

  it("does not alter symbols with numeric prefix of 1", () => {
    expect(parseInstrumentSymbol("1INCH")).toEqual({
      rawSymbol: "1INCH",
      canonicalSymbol: "1INCH",
      multiplier: 1,
      hadMultiplier: false,
    });
  });

  it("normalizes qty/price while preserving gross value", () => {
    const normalized = normalizeTradeEconomics(12, 0.0032, 1000);
    expect(normalized.canonicalQty).toBe(12000);
    expect(normalized.canonicalPrice).toBeCloseTo(0.0000032, 12);
    expect(normalized.canonicalGrossValue).toBeCloseTo(0.0384, 12);
    expect(normalized.invariantHolds).toBe(true);
    expect(normalized.invariantDelta).toBeLessThan(1e-8);
  });

  it("returns unchanged economics when no multiplier is present", () => {
    const normalized = normalizeTradeEconomics(2.5, 123.45, 1);
    expect(normalized.canonicalQty).toBe(2.5);
    expect(normalized.canonicalPrice).toBe(123.45);
    expect(normalized.canonicalGrossValue).toBe(308.625);
    expect(normalized.invariantHolds).toBe(true);
  });
});
