import { useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { derivePortfolio } from "@/lib/derivePortfolio";
import { fmtFiat } from "@/lib/cryptoState";

function startOf(period: "today" | "week" | "month"): number {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "week") {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export default function SessionPnl() {
  const { state } = useCrypto();
  const getPrice = usePortfolioPriceGetter();

  const periods = useMemo(() => {
    const all = state.txs;
    if (all.length === 0) return null;

    const compute = (period: "today" | "week" | "month") => {
      const cutoff = startOf(period);
      const before = all.filter(t => t.ts < cutoff);
      const { totalMV: mvBefore, totalCost: costBefore } = derivePortfolio(before, getPrice, 0);
      const { totalMV: mvAfter, totalCost: costAfter } = derivePortfolio(all, getPrice, 0);
      const pnlChange = (mvAfter - costAfter) - (mvBefore - costBefore);
      return { pnl: pnlChange, trades: all.filter(t => t.ts >= cutoff).length };
    };

    return {
      today: compute("today"),
      week: compute("week"),
      month: compute("month"),
    };
  }, [state.txs, getPrice]);

  if (!periods) return null;

  const cells = [
    { label: "Today P&L", ...periods.today },
    { label: "This Week P&L", ...periods.week },
    { label: "This Month P&L", ...periods.month },
  ];

  return (
    <div className="panel">
      <div className="panel-head">Session P&amp;L</div>
      <div className="panel-body" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {cells.map(c => (
          <div key={c.label} className="kpi-card" style={{ flex: "1 1 120px" }}>
            <div className="kpi-lbl">{c.label}</div>
            <div className={`kpi-val mono ${c.pnl >= 0 ? "good" : "bad"}`}>{c.pnl >= 0 ? "+" : ""}${fmtFiat(c.pnl)}</div>
            <div className="kpi-sub">{c.trades} trade{c.trades !== 1 ? "s" : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
