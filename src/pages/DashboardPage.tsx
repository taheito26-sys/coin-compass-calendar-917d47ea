import { useCrypto } from "@/lib/cryptoContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useMemo, useState, useEffect } from "react";
import MarketSentiment from "@/components/dashboard/MarketSentiment";
import PerAssetRiskBreakdown from "@/components/dashboard/PerAssetRiskBreakdown";
import BenchmarkChart from "@/components/dashboard/BenchmarkChart";
import { NetWorthChart } from "@/components/dashboard/NetWorthChart";

import RebalancingTool from "@/components/dashboard/RebalancingTool";
import { BreakEvenWidget } from "@/components/dashboard/BreakEvenWidget";
import { WhaleTracker } from "@/components/dashboard/WhaleTracker";

import { RiskMetrics } from "@/components/dashboard/RiskMetrics";
import { BenchmarkComparison } from "@/components/dashboard/BenchmarkComparison";
import { NewlyListed, TrendingSectors } from "@/components/dashboard/MarketMetadata";

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
  { id: "whale", label: "Whale Alert Feed", colSpan: 1 },
  { id: "risk-advanced", label: "Advanced Risk Metrics", colSpan: 1 },
  { id: "benchmark-v2", label: "Market Alpha Analysis", colSpan: 1 },
  { id: "breakEven", label: "Break-Even Targets" },
  { id: "rebalancer", label: "Rebalancing Tool" },
  { id: "allocation", label: "Coin Allocation" },
  { id: "heatmap", label: "Heatmap" },
  { id: "marketSentiment", label: "Market Sentiment" },
  { id: "trendingSectors", label: "Trending Sectors" },
  { id: "newlyListed", label: "Newly Listed" },
  { id: "riskBreakdown", label: "Per-Asset Risk" },
  { id: "movers", label: "Top Movers" },
  { id: "benchmark", label: "Portfolio vs Benchmarks" },
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

function DragHandle({ editing, onDragStart, onDragEnd }: { 
  editing: boolean; 
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  if (!editing) return null;
  return (
    <span
      className="dash-drag-handle"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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

  const [riskMetrics, setRiskMetrics] = useState<{ maxDrawdown: number; sessionPnl: number; sessionPnlPct: number; peakValue: number } | null>(null);

  useEffect(() => {
    async function loadRisk() {
      try {
        const { fetchRiskMetrics } = await import("@/lib/api");
        const data = await fetchRiskMetrics();
        setRiskMetrics(data);
      } catch (err) {
        console.error("Failed to load risk metrics:", err);
      }
    }
    loadRisk();
  }, [state.syncStatus]);

  const cardOrder = useMemo(() => {
    const raw = state.dashboardLayout || [];
    // If empty, return full list
    if (raw.length === 0) return ALL_CARDS.map(c => c.id);
    
    // Filter out invalid IDs
    const current = raw.filter(id => ALL_CARDS.some(c => c.id === id));
    
    // Append any newly added features that aren't in the saved layout
    const missing = ALL_CARDS.filter(c => !current.includes(c.id)).map(c => c.id);
    
    return [...current, ...missing];
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
  const applyPreset = (preset: "default" | "trader" | "taxes" | "hodler") => {
    let order: string[] = [];
    switch (preset) {
      case "trader": 
        order = ["kpis", "news", "whale", "correlation", "risk-advanced", "movers", "marketSentiment", "trendingSectors", "heatmap", "positions"];
        break;
      case "taxes":
        order = ["kpis", "breakEven", "positions"];
        break;
      case "hodler":
        order = ["kpis", "networth", "allocation", "rebalancer"];
        break;
      default:
        order = ALL_CARDS.map(c => c.id);
    }
    setState(prev => ({ ...prev, dashboardLayout: order }));
    toast.success(`Applied ${preset.toUpperCase()} layout`);
  };

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
          <div className="kpis" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
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
              <div className="kpi-lbl">DAILY P&L</div>
              <div className={`kpi-val ${riskMetrics?.sessionPnl && riskMetrics.sessionPnl >= 0 ? "good" : "bad"}`}>
                {riskMetrics ? (riskMetrics.sessionPnl >= 0 ? "+" : "") + fmtTotal(riskMetrics.sessionPnl) : "..."}
              </div>
              <div className="kpi-sub">{riskMetrics ? (riskMetrics.sessionPnlPct ?? 0).toFixed(2) + "%" : "vs yesterday"}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head"><span className={`kpi-badge`}>{totalPnlCombined >= 0 ? "▲" : "▼"}</span></div>
              <div className="kpi-lbl">TOTAL P&amp;L</div>
              <div className={`kpi-val ${totalPnlCombined >= 0 ? "good" : "bad"}`}>{(totalPnlCombined >= 0 ? "+" : "") + fmtTotal(totalPnlCombined)}</div>
              <div className="kpi-sub">Realized + Unrealized</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">MAX DRAWDOWN</div>
              <div className="kpi-val bad">{riskMetrics ? (riskMetrics.maxDrawdown ?? 0).toFixed(2) + "%" : "..."}</div>
              <div className="kpi-sub">Peak to trough</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-lbl">TX COUNT</div>
              <div className="kpi-val">{txCount}</div>
              <div className="kpi-sub">Total events</div>
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
      case "trendingSectors":
        return (
          <div className="panel" key="trendingSectors" onDragOver={(e) => handleDragOver(e, "trendingSectors")} onDrop={() => handleDrop("trendingSectors")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("trendingSectors")} onDragEnd={handleDragEnd} />
              <h2>Trending Sectors</h2>
            </div>
            <div className="panel-body">
              <TrendingSectors />
            </div>
          </div>
        );
      case "newlyListed":
        return (
          <div className="panel" key="newlyListed" onDragOver={(e) => handleDragOver(e, "newlyListed")} onDrop={() => handleDrop("newlyListed")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("newlyListed")} onDragEnd={handleDragEnd} />
              <h2>Newly Listed</h2>
            </div>
            <div className="panel-body">
              <NewlyListed />
            </div>
          </div>
        );
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

      case "rebalancer":
        return (
          <div className="panel" key="rebalancer" onDragOver={(e) => handleDragOver(e, "rebalancer")} onDrop={() => handleDrop("rebalancer")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("rebalancer")} onDragEnd={handleDragEnd} />
              <h2>Rebalancing Tool</h2>
            </div>
            <div className="panel-body">
              <RebalancingTool />
            </div>
          </div>
        );
      case "breakEven":
        return (
          <div className="panel" key="breakEven" onDragOver={(e) => handleDragOver(e, "breakEven")} onDrop={() => handleDrop("breakEven")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("breakEven")} onDragEnd={handleDragEnd} />
              <h2>Break-Even Targets</h2>
            </div>
            <div className="panel-body">
              <BreakEvenWidget />
            </div>
          </div>
        );
      case "whale":
        return (
          <div className="panel" key="whale" onDragOver={(e) => handleDragOver(e, "whale")} onDrop={() => handleDrop("whale")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("whale")} onDragEnd={handleDragEnd} />
              <h2>Whale Alert Feed</h2>
            </div>
            <div className="panel-body">
              <WhaleTracker />
            </div>
          </div>
        );
      case "risk-advanced":
        return (
          <div className="panel" key="risk-advanced" onDragOver={(e) => handleDragOver(e, "risk-advanced")} onDrop={() => handleDrop("risk-advanced")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("risk-advanced")} onDragEnd={handleDragEnd} />
              <h2>Advanced Risk Metrics</h2>
            </div>
            <div className="panel-body">
              <RiskMetrics />
            </div>
          </div>
        );
      case "benchmark-v2":
        return (
          <div className="panel" key="benchmark-v2" onDragOver={(e) => handleDragOver(e, "benchmark-v2")} onDrop={() => handleDrop("benchmark-v2")}>
            <div className="panel-head">
              <DragHandle editing={editing} onDragStart={() => handleDragStart("benchmark-v2")} onDragEnd={handleDragEnd} />
              <h2>Market Alpha Analysis</h2>
            </div>
            <div className="panel-body">
              <BenchmarkComparison />
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
        {editing && (
          <div style={{ display: "flex", gap: 4, marginRight: 12, padding: "3px 6px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px dashed var(--line)" }}>
            <span style={{ fontSize: 8, color: "var(--muted2)", alignSelf: "center", marginRight: 4, textTransform: "uppercase", fontWeight: 800 }}>Presets:</span>
            <button className="btn tiny secondary" style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => applyPreset("hodler")}>HODLer</button>
            <button className="btn tiny secondary" style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => applyPreset("trader")}>Trader</button>
            <button className="btn tiny secondary" style={{ fontSize: 9, padding: "2px 6px" }} onClick={() => applyPreset("taxes")}>Taxes</button>
          </div>
        )}
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
