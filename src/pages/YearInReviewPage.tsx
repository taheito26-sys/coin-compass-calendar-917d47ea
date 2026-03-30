import { useMemo, useState } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { deriveRealizedByTx } from "@/lib/derivePortfolio";
import { fmtFiat } from "@/lib/cryptoState";

export default function YearInReviewPage() {
  const { state } = useCrypto();
  const getPrice = usePortfolioPriceGetter();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const data = useMemo(() => {
    const allTxs = state.txs;
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();
    const yearTxs = allTxs.filter(t => t.ts >= yearStart && t.ts < yearEnd);

    if (yearTxs.length === 0) return null;

    const realizedMap = deriveRealizedByTx(allTxs);

    // Best & worst trade (by realized P&L on sell txs)
    const sells = yearTxs.filter(t => t.type === "sell").map(t => ({
      tx: t, pnl: realizedMap.get(t.id) ?? 0,
    }));
    sells.sort((a, b) => b.pnl - a.pnl);
    const bestTrade = sells[0] ?? null;
    const worstTrade = sells[sells.length - 1] ?? null;

    // Total realized P&L for year
    const totalRealized = sells.reduce((s, s2) => s + s2.pnl, 0);

    // Most traded asset
    const assetCount = new Map<string, number>();
    for (const t of yearTxs) assetCount.set(t.asset, (assetCount.get(t.asset) ?? 0) + 1);
    const mostTraded = [...assetCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    // Total fees
    const totalFees = yearTxs.reduce((s, t) => s + (t.fee || 0), 0);

    // Monthly P&L heatmap
    const months = Array.from({ length: 12 }, (_, m) => {
      const mStart = new Date(year, m, 1).getTime();
      const mEnd = new Date(year, m + 1, 1).getTime();
      const mSells = sells.filter(s => s.tx.ts >= mStart && s.tx.ts < mEnd);
      const pnl = mSells.reduce((s, s2) => s + s2.pnl, 0);
      const trades = yearTxs.filter(t => t.ts >= mStart && t.ts < mEnd).length;
      return { month: m, pnl, trades };
    });

    // Unique assets traded
    const uniqueAssets = new Set(yearTxs.map(t => t.asset)).size;

    return { yearTxs, bestTrade, worstTrade, totalRealized, mostTraded, totalFees, months, uniqueAssets, totalTrades: yearTxs.length };
  }, [state.txs, year, getPrice]);

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const availableYears = useMemo(() => {
    const years = new Set(state.txs.map(t => new Date(t.ts).getFullYear()));
    return [...years].sort((a, b) => b - a);
  }, [state.txs]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>{year} Year in Review</h2>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Your trading year at a glance</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {availableYears.map(y => (
            <button key={y} className={`btn${y === year ? "" : " secondary"}`} style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="panel"><div className="panel-body muted" style={{ padding: 40, textAlign: "center" }}>No transactions found for {year}.</div></div>
      ) : (
        <>
          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Trades", value: String(data.totalTrades), cls: "" },
              { label: "Unique Assets", value: String(data.uniqueAssets), cls: "" },
              { label: "Realized P&L", value: (data.totalRealized >= 0 ? "+" : "") + "$" + fmtFiat(data.totalRealized), cls: data.totalRealized >= 0 ? "good" : "bad" },
              { label: "Total Fees Paid", value: "$" + fmtFiat(data.totalFees), cls: "bad" },
              { label: "Most Traded", value: data.mostTraded ? `${data.mostTraded[0]} (${data.mostTraded[1]}x)` : "—", cls: "" },
            ].map(c => (
              <div key={c.label} className="kpi-card">
                <div className="kpi-lbl">{c.label}</div>
                <div className={`kpi-val mono ${c.cls}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Best / Worst Trade */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div className="panel">
              <div className="panel-head">Best Trade</div>
              <div className="panel-body">
                {data.bestTrade ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{data.bestTrade.tx.asset}</div>
                    <div className="good" style={{ fontSize: 20, fontWeight: 800 }}>+${fmtFiat(data.bestTrade.pnl)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{new Date(data.bestTrade.tx.ts).toLocaleDateString()} · Sold {data.bestTrade.tx.qty} @ ${data.bestTrade.tx.price}</div>
                  </>
                ) : <span className="muted">No sell trades this year</span>}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">Worst Trade</div>
              <div className="panel-body">
                {data.worstTrade && data.worstTrade.pnl < 0 ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{data.worstTrade.tx.asset}</div>
                    <div className="bad" style={{ fontSize: 20, fontWeight: 800 }}>${fmtFiat(data.worstTrade.pnl)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{new Date(data.worstTrade.tx.ts).toLocaleDateString()} · Sold {data.worstTrade.tx.qty} @ ${data.worstTrade.tx.price}</div>
                  </>
                ) : <span className="muted">No losing trades this year</span>}
              </div>
            </div>
          </div>

          {/* Monthly P&L Heatmap */}
          <div className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-head">Monthly P&amp;L</div>
            <div className="panel-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
                {data.months.map(m => {
                  const abs = Math.abs(m.pnl);
                  const bg = m.pnl > 0 ? `rgba(22,163,74,${Math.min(abs / 5000, 1) * 0.7 + 0.1})`
                           : m.pnl < 0 ? `rgba(220,38,38,${Math.min(abs / 5000, 1) * 0.7 + 0.1})`
                           : "var(--panel2)";
                  return (
                    <div key={m.month} style={{ background: bg, borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{MONTH_LABELS[m.month]}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: m.pnl > 0 ? "var(--good)" : m.pnl < 0 ? "var(--bad)" : "var(--muted)" }}>
                        {m.pnl !== 0 ? (m.pnl > 0 ? "+" : "") + "$" + fmtFiat(m.pnl) : "—"}
                      </div>
                      {m.trades > 0 && <div style={{ fontSize: 9, color: "var(--muted2)" }}>{m.trades}t</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
