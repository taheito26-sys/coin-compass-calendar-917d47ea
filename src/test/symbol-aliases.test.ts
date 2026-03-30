import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "@/lib/symbolAliases";

describe("symbol alias normalization", () => {
  it("preserves non-multiplier numeric prefixes like 1INCH", () => {
    expect(normalizeSymbol("1INCH")).toBe("1INCH");
  });

  it("does not strip multiplier prefixes directly", () => {
    expect(normalizeSymbol("1000PEPE")).toBe("1000PEPE");
  });
});
