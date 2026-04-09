import { useState, useMemo, useEffect } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtTotal, fmtQty } from "@/lib/cryptoState";
import { derivePortfolio, deriveRealizedByTx } from "@/lib/derivePortfolio";
import { usePortfolioPriceGetter } from "@/hooks/usePortfolioPriceGetter";
import { resolveAssetSymbol } from "@/lib/assetResolver";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

type CalendarDetail = {
  asset: string;
  qty: number;
  unrealizedPnl: number;
  realizedPnl: number;
  type: string;
  price: number;
};

type CalendarDayData = {
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dailyPnl: number;
  dailyPnlPct: number;
  realizedPnl: number;
  value: number;
  costBasis: number;
  trades: number;
  details: CalendarDetail[];
};

// Historical prices: date -> symbol -> close_price
type HistoricalPriceMap = Map<string, Map<string, number>>;

function createHistoricalPriceGetter(
  dateStr: string,
  historicalPriceMap: HistoricalPriceMap,
  txsUntilEnd: { asset: string; price: number }[],
  getLivePrice: (sym: string) => number | null,
  useLivePrices: boolean,
) {
  // Tier 1: DB historical prices for the exact date
  const dbPrices = historicalPriceMap.get(dateStr);

  // Tier 2: Last known transaction price as fallback
  const txPrices = new Map<string, number>();
  for (const tx of txsUntilEnd) {
    const px = Number(tx.price || 0);
    if (px > 0) txPrices.set(tx.asset.toUpperCase(), px);
  }

  return (sym: string): number | null => {
    if (useLivePrices) return getLivePrice(sym);

    const key = sym.toUpperCase();

    // Try DB historical price first
    const dbPrice = dbPrices?.get(key);
    if (dbPrice != null && dbPrice > 0) return dbPrice;

    // Fallback to transaction-derived price
    const txPrice = txPrices.get(key);
    return txPrice ?? null;
  };
}

export default function CalendarPage() {
  const { state } = useCrypto();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);
  const [showCoinFilter, setShowCoinFilter] = useState(false);
  const priceGetter = usePortfolioPriceGetter();

  const daysInM = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const allCoins = useMemo(() => {
    const coins = new Set<string>();
    state.txs.forEach((tx) => {
      const sym = resolveAssetSymbol(tx.asset);
      if (sym) coins.add(sym);
    });
    return [...coins].sort();
  }, [state.txs]);

  // Fetch historical prices from DB for the current month
  const [historicalPriceMap, setHistoricalPriceMap] = useState<HistoricalPriceMap>(new Map());

  useEffect(() => {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInM).padStart(2, "0")}`;

    supabase
      .from("price_history")
      .select("date, close_price, assets!inner(symbol)")
      .gte("date", startDate)
      .lte("date", endDate)
      .then(({ data }) => {
        const map: HistoricalPriceMap = new Map();
        if (data) {
          for (const row of data as any[]) {
            const dateStr = row.date;
            const sym = (row.assets?.symbol ?? "").toUpperCase();
            const price = Number(row.close_price);
            if (!sym || !price) continue;
            if (!map.has(dateStr)) map.set(dateStr, new Map());
            map.get(dateStr)!.set(sym, price);
          }
        }
        setHistoricalPriceMap(map);
      });
  }, [year, month, daysInM]);

  const toggleCoin = (coin: string) => {
    setSelectedCoins((prev) =>
      prev.includes(coin) ? prev.filter((c) => c !== coin) : [...prev, coin],
    );
  };

  const dailyData = useMemo(() => {
    const data: Record<number, CalendarDayData> = {};

    const selected = new Set(selectedCoins.map((c) => c.toUpperCase()));

    const today = new Date();
    const maxDay = (year === today.getFullYear() && month === today.getMonth())
      ? today.getDate()
      : (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth()))
        ? daysInM
        : 0;

    if (maxDay === 0) return data;

    const relevantTxs = state.txs
      .map((tx) => ({ ...tx, asset: resolveAssetSymbol(tx.asset) }))
      .filter((tx) => selected.size === 0 || selected.has(tx.asset.toUpperCase()))
      .sort((a, b) => a.ts - b.ts);

    const realizedByTx = deriveRealizedByTx(relevantTxs);

    let prevMV: number | null = null;

    for (let d = 1; d <= maxDay; d++) {
      const dayEnd = new Date(year, month, d + 1).getTime();
      const dayStart = new Date(year, month, d).getTime();
      const isTodayCell =
        d === today.getDate() &&
        year === today.getFullYear() &&
        month === today.getMonth();

      const txsUntilEnd = relevantTxs.filter((tx) => tx.ts < dayEnd);
      if (txsUntilEnd.length === 0) {
        prevMV = 0;
        continue;
      }

      const dayPriceGetter = createHistoricalPriceGetter(txsUntilEnd, priceGetter, isTodayCell);
      const portfolio = derivePortfolio(txsUntilEnd, dayPriceGetter);

      // Cumulative unrealized P&L = market value - cost basis
      const unrealizedPnl = portfolio.totalPnl;
      const unrealizedPnlPct = portfolio.totalCost > 0
        ? (unrealizedPnl / portfolio.totalCost) * 100 : 0;

      // Daily P&L = change in portfolio value from previous day
      const dailyPnl = prevMV !== null ? portfolio.totalMV - prevMV : 0;
      const dailyPnlPct = prevMV !== null && prevMV > 0
        ? (dailyPnl / prevMV) * 100 : 0;

      prevMV = portfolio.totalMV;

      // Realized P&L for transactions on THIS day only
      let dayRealizedPnl = 0;
      const dayDetails: CalendarDetail[] = [];
      let dayTrades = 0;

      for (const tx of relevantTxs) {
        if (tx.ts < dayStart || tx.ts >= dayEnd) continue;

        dayTrades++;
        const txRealized = realizedByTx.get(tx.id) ?? 0;

        let txUnrealized = 0;
        if (tx.type === "buy" || tx.type === "transfer_in") {
          const dayPrice = dayPriceGetter(tx.asset);
          txUnrealized = dayPrice !== null ? (dayPrice - tx.price) * Math.abs(tx.qty) : 0;
        }

        if (tx.type === "sell" || tx.type === "transfer_out") {
          dayRealizedPnl += txRealized;
        }

        dayDetails.push({
          asset: tx.asset,
          qty: Math.abs(tx.qty),
          unrealizedPnl: txUnrealized,
          realizedPnl: txRealized,
          type: tx.type,
          price: tx.price,
        });
      }

      data[d] = {
        unrealizedPnl,
        unrealizedPnlPct,
        dailyPnl,
        dailyPnlPct,
        realizedPnl: dayRealizedPnl,
        value: portfolio.totalMV,
        costBasis: portfolio.totalCost,
        trades: dayTrades,
        details: dayDetails,
      };
    }

    return data;
  }, [state.txs, year, month, daysInM, selectedCoins, priceGetter]);

  // Month-level KPIs: use last available day's cumulative unrealized
  const lastDayData = useMemo(() => {
    const days = Object.keys(dailyData).map(Number).sort((a, b) => b - a);
    return days.length > 0 ? dailyData[days[0]] : null;
  }, [dailyData]);

  const monthUnrealized = lastDayData?.unrealizedPnl ?? 0;
  const monthUnrealizedPct = lastDayData?.unrealizedPnlPct ?? 0;

  // Sum of all daily P&L changes across the month
  const monthDailyPnl = useMemo(() => {
    return Object.values(dailyData).reduce((s, d) => s + d.dailyPnl, 0);
  }, [dailyData]);
  const monthDailyPnlPct = useMemo(() => {
    // first day's prev MV as base
    const days = Object.keys(dailyData).map(Number).sort((a, b) => a - b);
    if (days.length < 2) return 0;
    const firstVal = dailyData[days[0]]?.value ?? 0;
    const lastVal = dailyData[days[days.length - 1]]?.value ?? 0;
    return firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
  }, [dailyData]);

  const monthRealized = useMemo(() => {
    return Object.values(dailyData).reduce((s, d) => s + d.realizedPnl, 0);
  }, [dailyData]);

  const tradeDays = Object.values(dailyData).filter(d => d.trades > 0).length;
  const totalTrades = Object.values(dailyData).reduce((s, d) => s + d.trades, 0);
  const selData = selectedDay ? dailyData[selectedDay] : null;

  const prev = () => {
    let m = month - 1, y = year;
    if (m < 0) { m = 11; y--; }
    setMonth(m); setYear(y); setSelectedDay(null);
  };

  const next = () => {
    let m = month + 1, y = year;
    if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y); setSelectedDay(null);
  };

  const fmtPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";

  return (
    <>
      {/* Coin filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={`btn ${showCoinFilter ? "" : "secondary"}`} onClick={() => setShowCoinFilter(!showCoinFilter)}>
          🪙 {selectedCoins.length > 0 ? `${selectedCoins.length} coins` : "All Coins"}
        </button>
        {selectedCoins.length > 0 && (
          <button className="btn secondary" onClick={() => setSelectedCoins([])}>Clear Filter</button>
        )}
        {selectedCoins.map(c => (
          <span key={c} className="pill good" style={{ cursor: "pointer" }} onClick={() => toggleCoin(c)}>
            {c} ✕
          </span>
        ))}
      </div>

      {showCoinFilter && (
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-body">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allCoins.map(coin => (
                <button
                  key={coin}
                  className={`btn tiny ${selectedCoins.includes(coin) ? "" : "secondary"}`}
                  onClick={() => toggleCoin(coin)}
                >
                  {coin}
                </button>
              ))}
              {allCoins.length === 0 && <span className="muted">No coins found. Add transactions first.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Monthly stats */}
      <div className="cal-stats">
        <div className="cal-stat">
          <div className="kpi-lbl">UNREALIZED P&L</div>
          <div className={`kpi-val ${monthUnrealized >= 0 ? "good" : "bad"}`}>
            {(monthUnrealized >= 0 ? "+" : "") + fmtTotal(monthUnrealized)}
          </div>
          <div className={`kpi-sub ${monthUnrealizedPct >= 0 ? "good" : "bad"}`} style={{ fontSize: 11 }}>
            {fmtPct(monthUnrealizedPct)}
          </div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">DAILY P&L</div>
          <div className={`kpi-val ${monthDailyPnl >= 0 ? "good" : "bad"}`}>
            {(monthDailyPnl >= 0 ? "+" : "") + fmtTotal(monthDailyPnl)}
          </div>
          <div className={`kpi-sub ${monthDailyPnlPct >= 0 ? "good" : "bad"}`} style={{ fontSize: 11 }}>
            {fmtPct(monthDailyPnlPct)}
          </div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">Realized P&L</div>
          <div className={`kpi-val ${monthRealized >= 0 ? "good" : "bad"}`}>
            {(monthRealized >= 0 ? "+" : "") + fmtTotal(monthRealized)}
          </div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">Active Days</div>
          <div className="kpi-val">{tradeDays}</div>
        </div>
        <div className="cal-stat">
          <div className="kpi-lbl">Total Entries</div>
          <div className="kpi-val">{totalTrades}</div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="panel">
        <div className="panel-head">
          <h2>{MONTHS[month]} {year}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn secondary" onClick={prev}>← Prev</button>
            <button className="btn secondary" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(null); }}>Today</button>
            <button className="btn secondary" onClick={next}>Next →</button>
          </div>
        </div>
        <div className="panel-body">
          <div className="cal-grid">
            {DAYS.map(d => <div key={d} className="cal-hdr">{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} className="cal-day empty" />)}
            {Array.from({ length: daysInM }, (_, i) => {
              const d = i + 1;
              const dd = dailyData[d];
              const isToday = d === now.getDate() && year === now.getFullYear() && month === now.getMonth();
              const isSel = d === selectedDay;
              const hasTrades = dd && dd.trades > 0;
              const displayPnl = dd ? dd.dailyPnl : 0;
              const cls = [
                "cal-day",
                dd && displayPnl > 0 ? "has-profit" : dd && displayPnl < 0 ? "has-loss" : "",
                isToday ? "today" : "",
                isSel ? "selected" : "",
              ].filter(Boolean).join(" ");
              return (
                <div key={d} className={cls} onClick={() => setSelectedDay(selectedDay === d ? null : d)}>
                  <div className="cal-num">{d}</div>
                  {dd && (
                    <>
                      <div className={`cal-profit ${dd.dailyPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 9 }}>
                        {(dd.dailyPnl >= 0 ? "+" : "") + fmtTotal(dd.dailyPnl)}
                      </div>
                      <div className={`cal-profit ${dd.dailyPnlPct >= 0 ? "good" : "bad"}`} style={{ fontSize: 8, opacity: 0.7 }}>
                        {fmtPct(dd.dailyPnlPct)}
                      </div>
                      {dd.realizedPnl !== 0 && (
                        <div className={`cal-profit ${dd.realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 8, opacity: 0.8 }}>
                          R: {(dd.realizedPnl >= 0 ? "+" : "") + fmtTotal(dd.realizedPnl)}
                        </div>
                      )}
                      {hasTrades && <div className="cal-count">{dd.trades}t</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day drilldown */}
      {selectedDay && selData && (
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="panel-head">
            <h2>📅 {MONTHS[month]} {selectedDay}</h2>
            {selData.value > 0 && (
              <span className="pill">Portfolio: {fmtTotal(selData.value)}</span>
            )}
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
              <div className="cal-stat">
                <div className="kpi-lbl">UNREALIZED P&L</div>
                <div className={`kpi-val ${selData.unrealizedPnl >= 0 ? "good" : "bad"}`}>
                  {(selData.unrealizedPnl >= 0 ? "+" : "") + fmtTotal(selData.unrealizedPnl)}
                </div>
                <div className={`kpi-sub ${selData.unrealizedPnlPct >= 0 ? "good" : "bad"}`} style={{ fontSize: 11 }}>
                  {fmtPct(selData.unrealizedPnlPct)}
                </div>
              </div>
              <div className="cal-stat">
                <div className="kpi-lbl">DAILY P&L</div>
                <div className={`kpi-val ${selData.dailyPnl >= 0 ? "good" : "bad"}`}>
                  {(selData.dailyPnl >= 0 ? "+" : "") + fmtTotal(selData.dailyPnl)}
                </div>
                <div className={`kpi-sub ${selData.dailyPnlPct >= 0 ? "good" : "bad"}`} style={{ fontSize: 11 }}>
                  {fmtPct(selData.dailyPnlPct)}
                </div>
              </div>
              <div className="cal-stat">
                <div className="kpi-lbl">Realized P&L</div>
                <div className={`kpi-val ${selData.realizedPnl >= 0 ? "good" : "bad"}`}>
                  {selData.realizedPnl !== 0
                    ? (selData.realizedPnl >= 0 ? "+" : "") + fmtTotal(selData.realizedPnl)
                    : "—"}
                </div>
              </div>
              <div className="cal-stat">
                <div className="kpi-lbl">Cost Basis</div>
                <div className="kpi-val">{fmtTotal(selData.costBasis)}</div>
              </div>
              <div className="cal-stat">
                <div className="kpi-lbl">Entries</div>
                <div className="kpi-val">{selData.trades}</div>
              </div>
            </div>

            {selData.trades > 0 && (
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th><th>Type</th><th>Qty</th><th>Price</th><th>Unrealized</th><th>Realized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selData.details.map((d, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 900 }}>{d.asset}</td>
                        <td className={`mono ${d.type === "sell" ? "bad" : d.type === "buy" ? "good" : "muted"}`} style={{ fontWeight: 700 }}>
                          {d.type.toUpperCase()}
                        </td>
                        <td className="mono">{fmtQty(d.qty)}</td>
                        <td className="mono">{fmtFiat(d.price, state.base)}</td>
                        <td className={`mono ${d.unrealizedPnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700 }}>
                          {d.type === "buy" || d.type === "transfer_in"
                            ? (d.unrealizedPnl >= 0 ? "+" : "") + fmtTotal(d.unrealizedPnl)
                            : "—"}
                        </td>
                        <td className={`mono ${d.realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700 }}>
                          {d.type === "sell" || d.type === "transfer_out"
                            ? (d.realizedPnl >= 0 ? "+" : "") + fmtTotal(d.realizedPnl)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selData.trades === 0 && (
              <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 12 }}>
                No trades on this day. Showing portfolio snapshot only.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}