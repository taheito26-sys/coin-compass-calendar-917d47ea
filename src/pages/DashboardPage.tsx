import { useCrypto } from "@/lib/cryptoContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useMemo, useState } from "react";
import MarketSentiment from "@/components/dashboard/MarketSentiment";
import TrendingSectors from "@/components/dashboard/TrendingSectors";
import NewlyListed from "@/components/dashboard/NewlyListed";
import PerAssetRiskBreakdown from "@/components/dashboard/PerAssetRiskBreakdown";
import BenchmarkChart from "@/components/dashboard/BenchmarkChart";
import { NetWorthChart } from "@/components/dashboard/NetWorthChart";

// ─── Constants ────────────────────────────────────────────────────────────────

const COIN_COLORS = [
  "#f97316", "#3b82f6", "#8b5cf6", "#ef4444", "#22c55e",
  "#06b6d4", "#ec4899", "#eab308", "#14b8a6", "#f43f5e",
  "#6366f1", "#84cc16", "#0ea5e9", "#d946ef", "#fb923c",
];

interface CardDef {
  id: string;
  label: string;
  colSpan?: number;
}

const ALL_CARDS: CardDef[] = [
  { id: "kpis", label: "KPI Summary", colSpan: 2 },
  { id: "networth", label: "Historical Net Worth", colSpan: 2 },
  { id: "allocation", label: "Coin Allocation" },
  { id: "heatmap", label: "Heatmap" },
  { id: "marketSentiment", label: "Market Sentiment" },
  { id: "trendingSectors", label: "Trending Sectors" },
  { id: "newlyListed", label: "Newly Listed" },
  { id: "riskBreakdown", label: "Per-Asset Risk" },
  { id: "movers", label: "Top Movers" },
  { id: "benchmark", label: "Portfolio vs Benchmarks" },
  { id: "watchlist", label: "Watchlist" },
  { id: "positions", label: "Top Positions", colSpan: 2 },
];

interface DonutSlice {
  label: string;
  value: number;
  pct: number;
  color: string;
}

function DonutChart({ slices, centerLabel, centerValue, centerSub, size = 200 }: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  centerSub: string;
  size?: number;
}) {
  const r = size / 2;
  const strokeW = size * 0.15;
  const innerR = r - strokeW / 2 - 4;
  const circumference = 2 * Math.PI * innerR;

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const dashLen = (s.pct / 100) * circumference;
    const dashOffset = -offset;
    offset += dashLen;
    return (
      <circle
        key={i} cx={r} cy={r} r={innerR} fill="none"
        stroke={s.color} strokeWidth={strokeW}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    );
  });

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={r} cy={r} r={innerR} fill="none" stroke="var(--line)" strokeWidth={strokeW} />
        {arcs}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8,
      }}>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{centerLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{centerValue}</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>{centerSub}</div>
      </div>
    </div>
  );
}

function DonutLegend({ slices }: { slices: DonutSlice[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", alignContent: "center" }}>
      {slices.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: s.color }} />
          <span style={{ fontWeight: 700, fontSize: 12, minWidth: 40 }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{s.pct.toFixed(s.pct < 1 ? 2 : 1)}%</span>
        </div>
      ))}
    </div>
  );
}

function HeatmapBlock({ sym, value, pct, color }: { sym: string; value: string; pct: string; color: string }) {
  return (
    <div
      style={{
        background: color, borderRadius: "var(--lt-radius-sm)",
        padding: "12px 8px", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2,
        minHeight: 80, transition: "transform 0.15s", cursor: "default",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{ fontWeight: 900, fontSize: 14, color: "#fff" }}>{sym}</div>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)" }}>{pct}</div>
    </div>
  );
}

function DragHandle({ editing }: { editing: boolean }) {
  if (!editing) return null;
  return (
    <span
      className="dash-drag-handle"
      style={{
        cursor: "grab", padding: "2px 4px", fontSize: 14, lineHeight: 1,
        color: "var(--muted2)", userSelect: "none",
      }}
    >
      ⠿
    </span>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage({ onNav }: { onNav?: (p: string) => void }) {
  const { state, setState } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const base = state.base || "USD";

  const positions = portfolio.positions;
  const totalMV     = portfolio.totalMV;
  const totalCost   = portfolio.totalCost;
  const totalPnl    = portfolio.totalPnl;
  const totalPnlPct = portfolio.totalPnlPct;
  const txCount     = state.txs.length;
  const realizedPnl = portfolio.realizedPnl;
  const totalPnlCombined = totalPnl + realizedPnl;

  const cardOrder = useMemo(() => {
    const raw = state.dashboardLayout;
    if (!raw || raw.length === 0) return ALL_CARDS.map(c => c.id);
    const valid = raw.filter(id => ALL_CARDS.some(c => c.id === id));
    for (const c of ALL_CARDS) {
      if (!valid.includes(c.id)) valid.push(c.id);
    }
    return valid;
  }, [state.dashboardLayout]);

  const [editing, setEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (id: string) => { setDraggedId(id); };
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); if (draggedId && draggedId !== id) setDragOverId(id); };
  
  const handleDrop = (id: string) => {
    if (!draggedId || draggedId === id) return;
    const next = [...cardOrder];
    const fromIdx = next.indexOf(draggedId);
    const toIdx = next.indexOf(id);
    if (fromIdx < 0 || toIdx < 0) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggedId);
    
    setState(prev => ({ ...prev, dashboardLayout: next }));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };
  const resetLayout = () => { 
    setState(prev => ({ ...prev, dashboardLayout: ALL_CARDS.map(c => c.id) }));
  };

  const coinSlices = useMemo((): DonutSlice[] => {
    if (totalMV <= 0) return [];
    const topCoins = positions.filter(r => {
      const live = getPrice(r.sym);
      return (live?.current_price ?? r.price ?? 0) * r.qty > 0;
    }).slice(0, 12);
    const topTotal = topCoins.reduce((s, r) => { const live = getPrice(r.sym); return s + (live?.current_price ?? r.price ?? 0) * r.qty; }, 0);
    const rest = totalMV - topTotal;
    const slices = topCoins.map((r, i) => {
      const live = getPrice(r.sym);
      const mv = (live?.current_price ?? r.price ?? 0) * r.qty;
      return { label: r.sym, value: mv, pct: (mv / totalMV) * 100, color: COIN_COLORS[i % COIN_COLORS.length] };
    });
    if (rest > 0.01) slices.push({ label: "Other", value: rest, pct: (rest / totalMV) * 100, color: "var(--muted2)" });
    return slices;
  }, [positions, totalMV, getPrice]);

  const heatmapItems = useMemo(() => {
    return positions.map(r => {
      const live = getPrice(r.sym);
      const liveP = live?.current_price ?? r.price ?? 0;
      const mv = liveP * r.qty;
      const unreal = mv - r.cost;
      const pnlPct = r.cost > 0 ? (unreal / r.cost) * 100 : 0;
      const isPositive = unreal >= 0;
      const intensity = Math.min(Math.abs(pnlPct) / 50, 1);
      const bg = isPositive ? `rgba(22,163,74,${0.3 + intensity * 0.5})` : `rgba(220,38,38,${0.3 + intensity * 0.5})`;
      return { sym: r.sym, value: fmtTotal(mv), pct: (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%", color: bg, mv };
    }).filter(x => x.mv > 0).sort((a, b) => b.mv - a.mv).slice(0, 9);
  }, [positions, getPrice]);

  const watchlistData = useMemo(() => {
    return state.watch.map(sym => {
      const live = getPrice(sym);
      return { sym, price: live?.current_price ?? null, change24h: live?.price_change_percentage_24h_in_currency ?? null, change7d: live?.price_change_percentage_7d_in_currency ?? null };
    });
  }, [state.watch, getPrice]);

  const { topGainers, topLosers } = useMemo(() => {
    const withPnl = positions.map(r => {
      const live = getPrice(r.sym);
      const liveP = live?.current_price ?? r.price ?? 0;
      const unreal = liveP * r.qty - r.cost;
      const pnlPct = r.cost > 0 ? (unreal / r.cost) * 100 : 0;
      return { sym: r.sym, pnlPct, pnlAbs: unreal };
    }).filter(r => r.pnlAbs !== 0);
    const sorted = [...withPnl].sort((a, b) => b.pnlPct - a.pnlPct);
    return { topGainers: sorted.filter(x => x.pnlPct > 0).slice(0, 3), topLosers: sorted.filter(x => x.pnlPct < 0).slice(-3).reverse() };
  }, [positions, getPrice]);

  const topCoin = coinSlices.length > 0 ? coinSlices[0] : null;

  const displayPositions = useMemo(() => {
    return positions.map(r => {
      const live = getPrice(r.sym);
      const price = live?.current_price ?? r.price ?? null;
      const mv = price !== null ? price * r.qty : null;
      const unreal = mv !== null ? mv - r.cost : null;
      return { ...r, price, mv, unreal, avg: r.avg };
    });
  }, [positions, getPrice]);

  const renderCard = (id: string) => {
    const def = ALL_CARDS.find(c => c.id === id);
    if (!def) return null;

    switch (id) {
      case "kpis":
        return (
          <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            <div className="kpi-card">
              <div className="kpi-head"><span className="kpi-badge" style={{ background: "var(--brand)" }}>Σ</span></div>
              <div className="kpi-lbl">CURRENT TOTAL</div>
              <div className="kpi-val">{fmtFiat(totalMV, base)}</div>
              <div className="kpi-sub">Market value</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head"><span className={`kpi-badge`}>{totalPnl >= 0 ? "▲" : "▼"}</span></div>
              <div className="kpi-lbl">UNREALIZED P&amp;L</div>
              <div className={`kpi-val ${totalPnl >= 0 ? "good" : "bad"}`}>{(totalPnl >= 0 ? "+" : "") + fmtTotal(totalPnl)}</div>
              <div className="kpi-sub">{totalCost > 0 ? totalPnlPct.toFixed(2) + "%" : "-"}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">REALIZED P&amp;L</div>
              <div className={`kpi-val ${realizedPnl >= 0 ? "good" : "bad"}`}>{(realizedPnl >= 0 ? "+" : "") + fmtTotal(realizedPnl)}</div>
              <div className="kpi-sub">From closed trades</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head"><span className={`kpi-badge`}>{totalPnlCombined >= 0 ? "▲" : "▼"}</span></div>
              <div className="kpi-lbl">TOTAL P&amp;L</div>
              <div className={`kpi-val ${totalPnlCombined >= 0 ? "good" : "bad"}`}>{(totalPnlCombined >= 0 ? "+" : "") + fmtTotal(totalPnlCombined)}</div>
              <div className="kpi-sub">Realized + Unrealized</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">TOTAL COST</div>
              <div className="kpi-val">{fmtFiat(totalCost, base)}</div>
              <div className="kpi-sub">{txCount} transactions</div>
            </div>
          </div>
        );

      case "allocation":
        return (
          <div className="panel">
            <div className="panel-head"><DragHandle editing={editing} /><h2>Coin Allocation</h2></div>
            <div className="panel-body" style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              {coinSlices.length > 0 ? (
                <>
                  <DonutChart slices={coinSlices} centerLabel={topCoin?.label ?? "-"} centerValue={fmtTotal(topCoin?.value ?? 0)} centerSub={topCoin ? topCoin.pct.toFixed(1) + "%" : ""} size={180} />
                  <DonutLegend slices={coinSlices} />
                </>
              ) : (
                <div className="muted" style={{ padding: 20, textAlign: "center", width: "100%" }}>No positions. Add transactions in the Ledger.</div>
              )}
            </div>
          </div>
        );

      case "heatmap":
        return (
          <div className="panel">
            <div className="panel-head"><DragHandle editing={editing} /><h2>Heatmap</h2></div>
            <div className="panel-body">
              {heatmapItems.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {heatmapItems.map((item, i) => <HeatmapBlock key={i} sym={item.sym} value={item.value} pct={item.pct} color={item.color} />)}
                </div>
              ) : <div className="muted" style={{ padding: 20, textAlign: "center" }}>No positions to display.</div>}
            </div>
          </div>
        );

      case "marketSentiment": return <MarketSentiment />;
      case "trendingSectors": return <TrendingSectors />;
      case "newlyListed": return <NewlyListed />;
      case "riskBreakdown": return <PerAssetRiskBreakdown compact />;
      case "benchmark": return <BenchmarkChart compact />;
      case "networth":
        return (
          <div className="panel">
            <div className="panel-head"><DragHandle editing={editing} /><h2>Historical Net Worth</h2></div>
            <div className="panel-body">
              <NetWorthChart />
            </div>
          </div>
        );

      case "movers":
        return (
          <div className="panel">
            <div className="panel-head"><DragHandle editing={editing} /><h2>Top Movers</h2></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {(topGainers.length > 0 || topLosers.length > 0) ? (
                <table>
                  <thead><tr><th>Asset</th><th style={{ textAlign: "right" }}>P&amp;L %</th><th style={{ textAlign: "right" }}>P&amp;L</th></tr></thead>
                  <tbody>
                    {topGainers.map(g => (
                      <tr key={g.sym}>
                        <td className="mono" style={{ fontWeight: 900 }}>{g.sym}</td>
                        <td className="mono good" style={{ textAlign: "right", fontWeight: 700 }}>▲ {g.pnlPct.toFixed(2)}%</td>
                        <td className="mono good" style={{ textAlign: "right" }}>+{fmtTotal(g.pnlAbs)}</td>
                      </tr>
                    ))}
                    {topLosers.map(l => (
                      <tr key={l.sym}>
                        <td className="mono" style={{ fontWeight: 900 }}>{l.sym}</td>
                        <td className="mono bad" style={{ textAlign: "right", fontWeight: 700 }}>▼ {Math.abs(l.pnlPct).toFixed(2)}%</td>
                        <td className="mono bad" style={{ textAlign: "right" }}>{fmtTotal(l.pnlAbs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="muted" style={{ padding: 20, textAlign: "center" }}>No movers yet.</div>}
            </div>
          </div>
        );

      case "watchlist":
        return (
          <div className="panel">
            <div className="panel-head"><DragHandle editing={editing} /><h2>Watchlist</h2><span className="pill">{watchlistData.length} coins</span></div>
            <div className="panel-body" style={{ padding: 0 }}>
              {watchlistData.length > 0 ? (
                <table>
                  <thead><tr><th>Coin</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>24h</th><th style={{ textAlign: "right" }}>7d</th></tr></thead>
                  <tbody>
                    {watchlistData.map(w => (
                      <tr key={w.sym}>
                        <td className="mono" style={{ fontWeight: 900 }}>{w.sym}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{w.price !== null ? fmtPx(w.price) : "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          {w.change24h !== null ? <span className={`mono ${w.change24h >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>{w.change24h >= 0 ? "▲" : "▼"} {Math.abs(w.change24h).toFixed(2)}%</span> : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {w.change7d !== null ? <span className={`mono ${w.change7d >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>{w.change7d >= 0 ? "▲" : "▼"} {Math.abs(w.change7d).toFixed(2)}%</span> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="muted" style={{ padding: 20, textAlign: "center" }}>Add coins to your watchlist in Markets.</div>}
            </div>
          </div>
        );

      case "positions":
        return (
          <div className="panel">
            <div className="panel-head">
              <DragHandle editing={editing} />
              <h2>Top Positions</h2>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="pill">{displayPositions.length} assets</span>
                {onNav && <button className="btn tiny secondary" onClick={() => onNav("assets")}>View All →</button>}
              </div>
            </div>
            <div className="panel-body" style={{ padding: 0, overflow: "auto", maxHeight: 260 }}>
              <div className="tableWrap">
                <table style={{ fontSize: 11 }}>
                  <thead><tr><th>Asset</th><th>Qty</th><th>Price</th><th>MV</th><th>P&amp;L</th></tr></thead>
                  <tbody>
                    {displayPositions.length > 0 ? displayPositions.slice(0, 8).map(r => (
                      <tr key={r.sym}>
                        <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                        <td className="mono">{fmtQty(r.qty)}</td>
                        <td className="mono">{r.price === null ? "—" : fmtPx(r.price)}</td>
                        <td className="mono">{r.mv === null ? "—" : fmtTotal(r.mv)}</td>
                        <td className={`mono ${r.unreal === null ? "" : r.unreal >= 0 ? "good" : "bad"}`} style={{ fontWeight: 900 }}>
                          {r.unreal === null ? "—" : (r.unreal >= 0 ? "+" : "") + fmtTotal(r.unreal)}
                        </td>
                      </tr>
                    )) : <tr><td colSpan={5} className="muted">No positions yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      default: return null;
    }
  };

  const cardRows = useMemo(() => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentSpan = 0;
    for (const id of cardOrder) {
      const def = ALL_CARDS.find(c => c.id === id);
      if (!def) continue;
      const span = def.colSpan || 1;
      if (span === 2) {
        if (currentRow.length > 0) rows.push(currentRow);
        rows.push([id]);
        currentRow = [];
        currentSpan = 0;
      } else {
        currentRow.push(id);
        currentSpan += span;
        if (currentSpan >= 2) { rows.push(currentRow); currentRow = []; currentSpan = 0; }
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
  }, [cardOrder]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span className="pill">{base}</span>
        <div style={{ flex: 1 }} />
        <button 
          className="btn tiny secondary" 
          onClick={async () => {
            const toastId = toast.loading("Generating portfolio snapshot...");
            try {
              await supabase.functions.invoke("daily-snapshot");
              toast.success("Snapshot generated!", { id: toastId });
              window.location.reload();
            } catch (err) {
              toast.error("Failed to generate snapshot", { id: toastId });
            }
          }}
        >
          ⚡ Sync & Snapshot
        </button>
        <button className={`btn tiny ${editing ? "" : "secondary"}`} onClick={() => setEditing(!editing)}
          style={editing ? { background: "var(--brand)", color: "#fff", border: "none" } : {}}>
          {editing ? "✓ Done" : "⚙ Customize"}
        </button>
        {editing && <button className="btn tiny secondary" onClick={resetLayout}>↺ Reset</button>}
      </div>

      {cardRows.map((row, ri) => {
        const isFullWidth = row.length === 1 && (ALL_CARDS.find(c => c.id === row[0])?.colSpan === 2);
        if (isFullWidth) {
          const id = row[0];
          return (
            <div key={`row-${ri}`} draggable={editing} onDragStart={() => handleDragStart(id)} onDragOver={e => handleDragOver(e, id)} onDrop={() => handleDrop(id)} onDragEnd={handleDragEnd}
              style={{ marginBottom: 10, opacity: draggedId === id ? 0.5 : 1, outline: dragOverId === id ? "2px dashed var(--brand)" : "none", outlineOffset: 2, borderRadius: "var(--lt-radius-sm)", transition: "opacity .15s" }}>
              {id === "kpis" && editing && (
                <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ cursor: "grab", fontSize: 14 }}>⠿</span> KPI Summary
                </div>
              )}
              {renderCard(id)}
            </div>
          );
        }
        return (
          <div key={`row-${ri}`} className="dashboard-charts-grid">
            {row.map(id => (
              <div key={id} draggable={editing} onDragStart={() => handleDragStart(id)} onDragOver={e => handleDragOver(e, id)} onDrop={() => handleDrop(id)} onDragEnd={handleDragEnd}
                style={{ opacity: draggedId === id ? 0.5 : 1, outline: dragOverId === id ? "2px dashed var(--brand)" : "none", outlineOffset: 2, borderRadius: "var(--lt-radius-sm)", transition: "opacity .15s" }}>
                {renderCard(id)}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
