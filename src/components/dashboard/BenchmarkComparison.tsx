import React, { useMemo } from "react";
import { fmtTotal } from "@/lib/cryptoState";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";

const BENCHMARKS = [
  { name: "Bitcoin (BTC)", perf: 32.4, color: "hsl(32 92% 50%)" },
  { name: "Ethereum (ETH)", perf: 18.2, color: "hsl(226 74% 63%)" },
  { name: "S&P 500 (SPY)", perf: 8.5, color: "hsl(var(--primary))" },
  { name: "Nasdaq 100 (QQQ)", perf: 12.1, color: "hsl(var(--secondary-foreground))" },
];

function scaleToBar(value: number) {
  return Math.min(100, Math.max(4, ((value + 20) / 80) * 100));
}

export function BenchmarkComparison() {
  const { positions, totalCost, totalMV, totalPnl, totalPnlPct } = useUnifiedPortfolio();

  const hasPortfolio = positions.length > 0 && totalCost > 0;
  const currentPnlPct = Number.isFinite(totalPnlPct) ? totalPnlPct : 0;

  const benchmarks = useMemo(() => {
    return BENCHMARKS.map((benchmark) => ({
      ...benchmark,
      alpha: currentPnlPct - benchmark.perf,
    }));
  }, [currentPnlPct]);

  if (!hasPortfolio) {
    return (
      <div className="text-center text-muted-foreground py-6 px-4">
        Add portfolio transactions to compare your live performance against BTC, ETH, and equity benchmarks.
      </div>
    );
  }

  return (
    <div className="benchmark-comparison">
      <div
        style={{
          background: "hsl(var(--muted) / 0.18)",
          padding: 8,
          borderRadius: 8,
          border: "1px solid hsl(var(--border))",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", textTransform: "uppercase" }}>
          Your Portfolio Alpha
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: currentPnlPct >= 0 ? "hsl(var(--foreground))" : "hsl(var(--destructive))",
          }}
        >
          {currentPnlPct > 0 ? "+" : ""}
          {currentPnlPct.toFixed(1)}%
        </div>
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
          {fmtTotal(totalPnl)} unrealized on {fmtTotal(totalMV)} market value
        </div>
        <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 6 }}>
          {currentPnlPct > BENCHMARKS[0].perf
            ? "You are outperforming Bitcoin right now."
            : "Bitcoin is currently outperforming your portfolio."}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {benchmarks.map((benchmark) => (
          <div key={benchmark.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
              <span style={{ fontWeight: 800 }}>{benchmark.name}</span>
              <span
                style={{
                  fontWeight: 800,
                  color: benchmark.alpha >= 0 ? "hsl(142 71% 35%)" : "hsl(var(--destructive))",
                }}
              >
                {benchmark.alpha > 0 ? "+" : ""}
                {benchmark.alpha.toFixed(1)}% Alpha
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: "hsl(var(--muted) / 0.22)",
                borderRadius: 999,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: `${scaleToBar(benchmark.perf)}%`,
                  background: benchmark.color,
                  borderRadius: 999,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${scaleToBar(currentPnlPct)}%`,
                  top: -2,
                  height: 10,
                  width: 2,
                  background: "hsl(var(--foreground))",
                  zIndex: 1,
                  boxShadow: "0 0 4px hsl(var(--background))",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 8, color: "hsl(var(--muted-foreground))", lineHeight: 1.4 }}>
        Benchmarks are static reference returns. Portfolio values are calculated from your live derived positions and current market prices.
      </div>
    </div>
  );
}
