import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { derivePortfolio, type PortfolioSummary, type DerivedPosition, type ClosedPosition } from "@/lib/derivePortfolio";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";

export type { PortfolioSummary, DerivedPosition, ClosedPosition };

export function useUnifiedPortfolio(): PortfolioSummary & {
  base: string;
  method: string;
  getPosition: (sym: string) => DerivedPosition | undefined;
} {
  const { state } = useCrypto();
  const priceGetter = usePortfolioPriceGetter();

  const summary = useMemo(() => {
    return derivePortfolio(state.txs, priceGetter);
  }, [state.txs, priceGetter]);

  const positionMap = useMemo(() => {
    const map = new Map<string, DerivedPosition>();
    for (const p of summary.positions) {
      map.set(p.sym.toUpperCase(), p);
    }
    return map;
  }, [summary.positions]);

  return {
    ...summary,
    base: state.base || "USD",
    method: state.method || "FIFO",
    getPosition: (sym: string) => positionMap.get(sym.toUpperCase()),
  };
}
