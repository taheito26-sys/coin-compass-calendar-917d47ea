import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat, fmtQty, fmtPx, fmtTotal } from "@/lib/cryptoState";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useSparklineData } from "@/hooks/useSparklineData";
import { useIsMobile } from "@/hooks/use-mobile";
import AssetDrilldown from "@/components/AssetDrilldown";
import { Sparkline } from "@/components/portfolio/Sparkline";
import { AssetFilter } from "@/components/portfolio/AssetFilter";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLedgerMutations } from "@/hooks/useLedgerMutations";
import { useState, useMemo, useEffect } from "react";
import type { DerivedLot, ClosedPosition } from "@/lib/derivePortfolio";
import { deriveRealizedByTx } from "@/lib/derivePortfolio";
import { normalizeSymbol } from "@/lib/symbolAliases";
import RebalanceReviewPanel from "@/features/rebalance/components/RebalanceReviewPanel";
import { useRebalanceAnalysis } from "@/features/rebalance/hooks/useRebalanceAnalysis";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "dca" | "lot";
type TabMode = "open" | "history" | "rebalance";
const VIEW_MODE_KEY = "portfolio_view_mode";

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === "dca" || v === "lot") return v;
  } catch {}
  return "dca";
}

// ── Column config ──────────────────────────────────────────────────────────

const ALL_COLUMNS = [
  { key: "rank",       label: "#",            default: true  },
  { key: "asset",      label: "Asset",        default: true  },
  { key: "amount",     label: "Amount",       default: true  },
  { key: "sparkline",  label: "PRICE GRAPH",  default: true  },
  { key: "change1h",   label: "1h %",         default: true  },
  { key: "change24h",  label: "24h %",        default: true  },
  { key: "change7d",   label: "7d %",         default: true  },
  { key: "price",      label: "Price",        default: true  },
  { key: "total",      label: "Value",        default: true  },
  { key: "allocation", label: "Allocation %", default: true  },
  { key: "avg",        label: "Avg Buy",      default: true  },
  { key: "avgSell",    label: "Avg Sell",     default: false },
  { key: "pnl",        label: "P/L",          default: true  },
  { key: "pnlPct",     label: "Profit %",     default: true  },
  { key: "breakEven",  label: "Break-Even",   default: true  },
  { key: "realizedPnl",label: "Realized P/L", default: false },
  { key: "marketCap",  label: "Market Cap",   default: false },
  { key: "volume",     label: "Volume 24h",   default: false },
  { key: "actions",    label: "Sell",         default: true  },
];

const STORAGE_KEY  = "portfolio_visible_cols";
const COL_ORDER_KEY = "portfolio_col_order";

function loadVisibleCols(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key));
}

function loadColOrder(): string[] {
  try {
    const raw = localStorage.getItem(COL_ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return ALL_COLUMNS.map(c => c.key);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(0)  + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(0)  + "M";
  return n.toLocaleString();
}

function ChangePill({ val }: { val: number }) {
  if (val === 0) return <span className="mono muted">—</span>;
  return (
    <span className={`mono ${val > 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
      {val > 0 ? "▲" : "▼"} {Math.abs(val).toFixed(2)}%
    </span>
  );
}

// ── Display row type ───────────────────────────────────────────────────────

interface DisplayRow {
  sym: string;
  name: string;
  qty: number;
  price: number | null;
  avg: number;
  total: number;
  cost: number;
  pnlAbs: number;
  pnlPct: number;
  breakEven: number;
  realizedPnl: number;
  coinId: string;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume: number;
  lots: DerivedLot[];
}

// ── Sell Dialog with Confirmation ──────────────────────────────────────────

type SellStep = "form" | "confirm";

function SellDialog({ pos, base, onClose }: { pos: DisplayRow; base: string; onClose: () => void }) {
  const { toast } = useCrypto();
  const { createManualTransaction, writeStatus } = useLedgerMutations();
  const [step, setStep] = useState<SellStep>("form");
  const [qty, setQty] = useState(String(pos.qty));
  const [price, setPrice] = useState(pos.price !== null ? String(pos.price) : "");
  const [fee, setFee] = useState("0");
  const [saving, setSaving] = useState(false);

  const qtyNum = Math.abs(Number(qty) || 0);
  const priceNum = Number(price) || 0;
  const feeNum = Math.abs(Number(fee) || 0);
  const proceeds = qtyNum * priceNum - feeNum;
  const costBasis = pos.avg * qtyNum;
  const estPnl = proceeds - costBasis;
  const isFullClose = qtyNum > 0 && Math.abs(qtyNum - pos.qty) < 1e-10;
  const isPartial = qtyNum > 0 && qtyNum < pos.qty - 1e-10;

  const validationError = (() => {
    if (qtyNum <= 0) return "Quantity must be greater than zero";
    if (priceNum <= 0) return "Price must be greater than zero";
    if (qtyNum > pos.qty * 1.001) return `Cannot sell more than ${fmtQty(pos.qty)} ${pos.sym}`;
    if (feeNum < 0) return "Fee cannot be negative";
    return null;
  })();

  const handleReview = () => {
    if (validationError) { toast(validationError, "error"); return; }
    if (writeStatus !== "ready") { toast("Backend unavailable", "error"); return; }
    setStep("confirm");
  };

  const handleConfirmSell = async () => {
    setSaving(true);
    const result = await createManualTransaction({
      asset: pos.sym, type: "sell", qty: qtyNum, price: priceNum, fee: feeNum,
      base, venue: "", note: isFullClose ? "Position closed" : "Partial sell",
    });
    setSaving(false);
    if (result.success) {
      toast(`Sold ${fmtQty(qtyNum)} ${pos.sym}`, "success");
      onClose();
    } else {
      toast(result.error || "Sell failed", "error");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
        padding: 24, width: 400, maxWidth: "92vw",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            {step === "form" ? `Sell ${pos.sym}` : "Confirm Sale"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {step === "form" ? (
          <>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
              Holding: <span className="mono" style={{ fontWeight: 700, color: "var(--fg)" }}>{fmtQty(pos.qty)} {pos.sym}</span>
              {pos.price !== null && <> · Current: <span className="mono">${fmtPx(pos.price)}</span></>}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Quantity</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input className="input" type="number" step="any" min="0" value={qty} onChange={e => setQty(e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", fontSize: 13 }} />
                  <button className="btn secondary" style={{ padding: "6px 10px", fontSize: 10 }}
                    onClick={() => setQty(String(pos.qty))}>MAX</button>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Sell Price (USD)</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input className="input" type="number" step="any" min="0" value={price} onChange={e => setPrice(e.target.value)}
                    style={{ flex: 1, padding: "8px 10px", fontSize: 13 }} />
                  {pos.price !== null && (
                    <button className="btn secondary" style={{ padding: "6px 10px", fontSize: 10 }}
                      onClick={() => setPrice(String(pos.price))}>MARKET</button>
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Fee</label>
                <input className="input" type="number" step="any" min="0" value={fee} onChange={e => setFee(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: 13 }} />
              </div>
            </div>

            {/* Live preview */}
            <div style={{
              marginTop: 14, padding: 10, background: "var(--panel2)", borderRadius: 8,
              border: "1px solid var(--line)", fontSize: 11,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="muted">Proceeds</span>
                <span className="mono" style={{ fontWeight: 700 }}>${fmtFiat(Math.max(proceeds, 0))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="muted">Cost Basis</span>
                <span className="mono">${fmtFiat(costBasis)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Est. Realized P&L</span>
                <span className="mono" style={{ fontWeight: 800, color: estPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {(estPnl >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(estPnl))}
                </span>
              </div>
              {isFullClose && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "var(--brand3)", borderRadius: 4, fontSize: 10, color: "var(--brand)", fontWeight: 700, textAlign: "center" }}>
                  ⚡ Full position close — asset moves to History
                </div>
              )}
              {isPartial && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "var(--panel)", borderRadius: 4, fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
                  Partial sell — {fmtQty(pos.qty - qtyNum)} {pos.sym} remains
                </div>
              )}
            </div>

            {validationError && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--bad)", fontWeight: 600 }}>⚠ {validationError}</div>
            )}

            <button
              className="btn primary"
              disabled={!!validationError || writeStatus !== "ready"}
              onClick={handleReview}
              style={{ width: "100%", marginTop: 14, padding: "10px 16px", fontSize: 13, fontWeight: 800 }}
            >
              Review Sale →
            </button>
          </>
        ) : (
          /* ── Confirmation Step ── */
          <>
            <div style={{
              padding: 14, background: "var(--panel2)", borderRadius: 8,
              border: "1px solid var(--line)", fontSize: 12, marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                Transaction Summary
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                <div><span className="muted">Asset</span></div>
                <div className="mono" style={{ fontWeight: 800, textAlign: "right" }}>{pos.sym}</div>
                <div><span className="muted">Sell Quantity</span></div>
                <div className="mono" style={{ fontWeight: 700, textAlign: "right" }}>{fmtQty(qtyNum)}</div>
                <div><span className="muted">Sell Price</span></div>
                <div className="mono" style={{ fontWeight: 700, textAlign: "right" }}>${fmtPx(priceNum)}</div>
                {feeNum > 0 && <>
                  <div><span className="muted">Fee</span></div>
                  <div className="mono" style={{ textAlign: "right" }}>${fmtFiat(feeNum)}</div>
                </>}
                <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--line)", margin: "4px 0" }} />
                <div><span className="muted">Proceeds</span></div>
                <div className="mono" style={{ fontWeight: 700, textAlign: "right" }}>${fmtFiat(proceeds)}</div>
                <div><span className="muted">Cost Basis</span></div>
                <div className="mono" style={{ textAlign: "right" }}>${fmtFiat(costBasis)}</div>
                <div><span style={{ fontWeight: 700 }}>Realized P&L</span></div>
                <div className="mono" style={{ fontWeight: 900, textAlign: "right", color: estPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {(estPnl >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(estPnl))}
                </div>
              </div>

              <div style={{
                marginTop: 10, padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, textAlign: "center",
                background: isFullClose ? "var(--brand3)" : "var(--panel)",
                color: isFullClose ? "var(--brand)" : "var(--muted)",
                border: `1px solid ${isFullClose ? "var(--brand)" : "var(--line)"}`,
              }}>
                {isFullClose ? "⚡ FULL CLOSE — Position will move to History" : `PARTIAL SELL — ${fmtQty(pos.qty - qtyNum)} ${pos.sym} remains`}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn secondary"
                onClick={() => setStep("form")}
                style={{ flex: 1, padding: "10px 16px", fontSize: 13, fontWeight: 700 }}
              >
                ← Back
              </button>
              <button
                className="btn primary"
                disabled={saving}
                onClick={handleConfirmSell}
                style={{
                  flex: 2, padding: "10px 16px", fontSize: 13, fontWeight: 800,
                  background: isFullClose ? "var(--bad)" : undefined,
                }}
              >
                {saving ? "Executing…" : isFullClose ? `Confirm Close ${pos.sym}` : `Confirm Sell ${fmtQty(qtyNum)} ${pos.sym}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { state } = useCrypto();
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();
  const isMobile = useIsMobile();
  const {
    result: rebalanceResult,
    loading: rebalanceLoading,
    error: rebalanceError,
    runAnalysis: runRebalanceAnalysis,
  } = useRebalanceAnalysis();

  const base = state.base || "USD";

  // Local UI state
  const [viewMode,       setViewMode]       = useState<ViewMode>(loadViewMode);
  const [tabMode,        setTabMode]        = useState<TabMode>("open");
  const [visibleCols,    setVisibleCols]    = useState<Set<string>>(loadVisibleCols);
  const [colOrder,       setColOrder]       = useState<string[]>(loadColOrder);
  const [sortCol,        setSortCol]        = useState("total");
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("desc");
  const [filterSyms,     setFilterSyms]     = useState<Set<string>>(new Set());
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
  const [showColConfig,  setShowColConfig]  = useState(false);
  const [dragCol,        setDragCol]        = useState<string | null>(null);
  const [drilldownSym,   setDrilldownSym]   = useState<string | null>(null);
  const [sellPos,        setSellPos]        = useState<DisplayRow | null>(null);

  // Persist UI prefs
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); },  [viewMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY,   JSON.stringify([...visibleCols])); }, [visibleCols]);
  useEffect(() => { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder)); },        [colOrder]);

  // Ensure actions column is always in colOrder and visibleCols
  useEffect(() => {
    if (!colOrder.includes("actions")) {
      setColOrder(prev => [...prev, "actions"]);
    }
    if (!visibleCols.has("actions")) {
      setVisibleCols(prev => {
        const next = new Set(prev);
        next.add("actions");
        return next;
      });
    }
  }, []);

  const toggleCol = (key: string) => {
    if (key === "actions") return;
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const toggleExpand = (sym: string) => {
    setExpandedAssets(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const handleRefresh = () => window.location.reload();

  const isLotView = viewMode === "lot";

  // Build display rows from unified portfolio
  const displayRows = useMemo<DisplayRow[]>(() => {
    return portfolio.positions.map(r => {
      const live      = getPrice(r.sym);
      const livePrice = live?.current_price ?? r.price ?? null;
      const total     = livePrice !== null ? livePrice * r.qty : r.qty * (r.price ?? 0);
      const cost      = r.cost;
      const pnlAbs    = livePrice !== null ? total - cost : 0;
      const pnlPct    = cost > 0 && livePrice !== null ? (pnlAbs / cost) * 100 : 0;

      return {
        sym:         r.sym,
        name:        r.sym,
        qty:         r.qty,
        price:       livePrice,
        avg:         r.avg,
        total,
        cost,
        pnlAbs,
        pnlPct,
        breakEven:   r.avg,
        realizedPnl: r.realizedPnl,
        coinId:      live?.id ?? r.sym.toLowerCase(),
        change1h:    live?.price_change_percentage_1h_in_currency  ?? 0,
        change24h:   live?.price_change_percentage_24h_in_currency ?? 0,
        change7d:    live?.price_change_percentage_7d_in_currency  ?? 0,
        marketCap:   live?.market_cap    ?? 0,
        volume:      live?.total_volume  ?? 0,
        lots:        r.lots,
      };
    });
  }, [portfolio.positions, getPrice]);

  const sparkCoinIds = useMemo(() => displayRows.map(p => p.coinId), [displayRows]);
  const sparkData    = useSparklineData(sparkCoinIds);
  const allSymbols   = useMemo(() => displayRows.map(r => r.sym), [displayRows]);

  const filteredRows = useMemo(() => {
    if (filterSyms.size === 0) return displayRows;
    return displayRows.filter(r => filterSyms.has(r.sym));
  }, [displayRows, filterSyms]);

  const totalMV   = filteredRows.reduce((s, p) => s + p.total, 0);
  const totalCost = filteredRows.reduce((s, p) => s + p.cost,  0);
  const totalPnl  = totalMV - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const sorted = useMemo(() => {
    const m = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      switch (sortCol) {
        case "qty":        return (a.qty - b.qty) * m;
        case "price":      return ((a.price ?? 0) - (b.price ?? 0)) * m;
        case "avg":        return (a.avg - b.avg) * m;
        case "pnl":        return (a.pnlAbs - b.pnlAbs) * m;
        case "allocation": return (a.total - b.total) * m;
        case "breakEven":  return (a.breakEven - b.breakEven) * m;
        default:           return (a.total - b.total) * m;
      }
    });
  }, [filteredRows, sortCol, sortDir]);

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      <span style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>
        {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </span>
    </th>
  );

  const totalRealizedPnl = portfolio.realizedPnl;
  const closedPositions = portfolio.closedPositions;

  // ── Mobile card ──────────────────────────────────────────────────────────

  function MobileCard({ pos }: { pos: DisplayRow }) {
    const alloc    = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
    const isExpanded = expandedAssets.has(pos.sym);

    return (
      <div style={{
        background: "var(--panel2)", border: "1px solid var(--line)",
        borderRadius: "var(--lt-radius)", padding: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ cursor: "pointer" }} onClick={() => setDrilldownSym(pos.sym)}>
            <span className="mono" style={{ fontWeight: 900, fontSize: 15 }}>{pos.sym}</span>
            <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>{alloc.toFixed(1)}%</span>
            {isLotView && pos.lots.length > 0 && (
              <span onClick={e => { e.stopPropagation(); toggleExpand(pos.sym); }} style={{ marginLeft: 8, cursor: "pointer", color: "var(--muted)" }}>
                {isExpanded ? "▾" : "▸"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn bad"
              style={{ padding: "5px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}
              onClick={(e) => { e.stopPropagation(); setSellPos(pos); }}
            >
              Sell
            </button>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{fmtFiat(pos.total, base)}</div>
              <div style={{ fontSize: 11, color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 600 }}>
                {pos.pnlAbs >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
          <div><span className="muted">Qty </span><span className="mono">{fmtQty(pos.qty)}</span></div>
          <div><span className="muted">Price </span><span className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</span></div>
          <div><span className="muted">Avg </span><span className="mono">{pos.avg > 0 ? "$" + fmtPx(pos.avg) : "—"}</span></div>
          <div><span className="muted">Cost </span><span className="mono">{fmtFiat(pos.cost, base)}</span></div>
          <div>
            <span className="muted">P/L </span>
            <span className="mono" style={{ fontWeight: 700, color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
              {(pos.pnlAbs >= 0 ? "+" : "") + fmtFiat(pos.pnlAbs, base)}
            </span>
          </div>
        </div>
        {isLotView && isExpanded && pos.lots.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {pos.lots.slice().sort((a, b) => a.ts - b.ts).map(lot => {
              const lotCost = lot.qtyRem * lot.unitCost;
              const lotMV   = pos.price !== null ? lot.qtyRem * pos.price : null;
              const lotPnl  = lotMV !== null ? lotMV - lotCost : null;
              const dateStr = new Date(lot.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
              return (
                <div key={lot.id} style={{
                  marginLeft: 12, padding: "8px 10px", fontSize: 10,
                  borderLeft: "2px solid var(--line)", background: "var(--panel)",
                  borderRadius: "0 6px 6px 0", display: "grid",
                  gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4,
                }}>
                  <div><span className="muted">Date </span><span className="mono">{dateStr}</span></div>
                  <div><span className="muted">Qty </span><span className="mono">{fmtQty(lot.qtyRem)}</span></div>
                  <div><span className="muted">Unit Cost </span><span className="mono">${fmtPx(lot.unitCost)}</span></div>
                  {lotPnl !== null && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span className="muted">P/L </span>
                      <span className="mono" style={{ fontWeight: 700, color: lotPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                        {(lotPnl >= 0 ? "+" : "") + fmtFiat(lotPnl, base)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── History Tab ──────────────────────────────────────────────────────────

  type HistoryView = "closed" | "sells";
  const [historyView, setHistoryView] = useState<HistoryView>("closed");

  const sellEvents = useMemo(() => {
    const realizedMap = deriveRealizedByTx(state.txs);
    return state.txs
      .filter(tx => String(tx.type || "").toLowerCase() === "sell")
      .map(tx => {
        const sym = normalizeSymbol(tx.asset || "") || tx.asset;
        const qty = Math.abs(Number(tx.qty || 0));
        const price = Number(tx.price || 0);
        const fee = Number(tx.fee || 0);
        const proceeds = qty * price - fee;
        const realized = realizedMap.get(tx.id) ?? 0;
        const isInClosed = closedPositions.some(cp => cp.sym === sym);
        const isPositionOpen = portfolio.positions.some(p => p.sym === sym);
        return {
          id: tx.id, sym, qty, price, fee, proceeds, realizedPnl: realized, ts: tx.ts, note: tx.note || "",
          status: isInClosed ? "closed" as const : (isPositionOpen ? "partial" as const : "closed" as const),
        };
      })
      .sort((a, b) => b.ts - a.ts);
  }, [state.txs, portfolio.positions, closedPositions]);

  function HistoryTab() {
    const hasSells = sellEvents.length > 0;
    const hasClosed = closedPositions.length > 0;

    if (!hasSells && !hasClosed) {
      return <div className="muted" style={{ textAlign: "center", padding: 48, fontSize: 13 }}>No sell transactions or closed positions yet.</div>;
    }

    const totalClosedCost = closedPositions.reduce((s, p) => s + p.totalCost, 0);
    const totalClosedProceeds = closedPositions.reduce((s, p) => s + p.totalProceeds, 0);

    return (
      <div className="space-y-4">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px" }}>
            <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Total Realized P&L</div>
            <div className={`mono ${totalRealizedPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 14, fontWeight: 900 }}>
              {(totalRealizedPnl >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(totalRealizedPnl))}
            </div>
          </div>
          <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px" }}>
            <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Invested</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 900 }}>${fmtFiat(totalClosedCost)}</div>
          </div>
          <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px" }}>
            <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Proceeds</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 900 }}>${fmtFiat(totalClosedProceeds)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button className={`btn ${historyView === "closed" ? "primary" : "secondary"}`} onClick={() => setHistoryView("closed")} style={{ padding: "5px 12px", fontSize: 11 }}>
            Closed Positions ({closedPositions.length})
          </button>
          <button className={`btn ${historyView === "sells" ? "primary" : "secondary"}`} onClick={() => setHistoryView("sells")} style={{ padding: "5px 12px", fontSize: 11 }}>
            Sell Events ({sellEvents.length})
          </button>
        </div>

        {historyView === "closed" ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Asset</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Qty</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Avg Buy</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Avg Sell</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Cost</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Proceeds</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>P&L</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Return</th>
                </tr>
              </thead>
              <tbody>
                {closedPositions.map(cp => {
                  const ret = cp.totalCost > 0 ? ((cp.totalProceeds - cp.totalCost) / cp.totalCost) * 100 : 0;
                  return (
                    <tr key={cp.sym}>
                      <td><span className="mono" style={{ fontWeight: 900 }}>{cp.sym}</span></td>
                      <td className="mono">{fmtQty(cp.totalBought)}</td>
                      <td className="mono">${fmtPx(cp.avgBuy)}</td>
                      <td className="mono">${fmtPx(cp.avgSell)}</td>
                      <td className="mono">${fmtFiat(cp.totalCost)}</td>
                      <td className="mono">${fmtFiat(cp.totalProceeds)}</td>
                      <td className={`mono ${cp.realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 800 }}>
                        {(cp.realizedPnl >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(cp.realizedPnl))}
                      </td>
                      <td className={`mono ${ret >= 0 ? "good" : "bad"}`} style={{ fontSize: 11 }}>{ret >= 0 ? "▲" : "▼"}{Math.abs(ret).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Date</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Asset</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Qty</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Price</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Proceeds</th>
                  <th style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Realized P&L</th>
                </tr>
              </thead>
              <tbody>
                {sellEvents.map(ev => (
                  <tr key={ev.id}>
                    <td className="mono muted" style={{ fontSize: 10 }}>{new Date(ev.ts).toLocaleDateString()}</td>
                    <td><span className="mono" style={{ fontWeight: 900 }}>{ev.sym}</span></td>
                    <td className="mono">{fmtQty(ev.qty)}</td>
                    <td className="mono">${fmtPx(ev.price)}</td>
                    <td className="mono">${fmtFiat(ev.proceeds)}</td>
                    <td className={`mono ${ev.realizedPnl >= 0 ? "good" : "bad"}`} style={{ fontWeight: 800 }}>
                      {(ev.realizedPnl >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(ev.realizedPnl))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: "0 2px" }}>
      <div className="space-y-4">
        {/* Main Content (Tabs + Stats) */}
        <div className="space-y-4">
          <div style={{ display: "flex", gap: 2 }}>
            <button
              className={`btn ${tabMode === "open" ? "primary" : "secondary"}`}
              onClick={() => setTabMode("open")}
              style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: "8px 8px 0 0" }}
            >
              Open Positions {displayRows.length > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({displayRows.length})</span>}
            </button>
            <button
              className={`btn ${tabMode === "history" ? "primary" : "secondary"}`}
              onClick={() => setTabMode("history")}
              style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: "8px 8px 0 0" }}
            >
              History {closedPositions.length > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({closedPositions.length})</span>}
            </button>
            <button
              className={`btn ${tabMode === "rebalance" ? "primary" : "secondary"}`}
              onClick={() => setTabMode("rebalance")}
              style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: "8px 8px 0 0" }}
            >
              AI Rebalance
            </button>
          </div>

          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "0 8px 8px 8px", padding: 12 }}>
            {tabMode === "history" ? <HistoryTab /> : tabMode === "rebalance" ? (
              <RebalanceReviewPanel
                result={rebalanceResult}
                loading={rebalanceLoading}
                error={rebalanceError}
                onRunAnalysis={runRebalanceAnalysis}
              />
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
                  <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Portfolio Value</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 900 }}>{fmtTotal(totalMV)}</div>
                  <div style={{ fontSize: 8, color: "var(--muted)" }}>{filteredRows.length} assets</div>
                </div>
                <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
                  <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Unrealized P&L</div>
                  <div className={`mono ${totalPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 13, fontWeight: 900 }}>
                    {(totalPnl >= 0 ? "+" : "") + fmtTotal(totalPnl)}
                  </div>
                  <div style={{ fontSize: 8, color: "var(--muted)" }}>{totalPnlPct.toFixed(2)}%</div>
                </div>
                <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "var(--lt-radius-sm)", padding: "7px 12px", minWidth: 100 }}>
                  <div style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Realized P&L</div>
                  <div className={`mono ${totalRealizedPnl >= 0 ? "good" : "bad"}`} style={{ fontSize: 13, fontWeight: 900 }}>
                    {(totalRealizedPnl >= 0 ? "+" : "") + fmtTotal(totalRealizedPnl)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {tabMode === "open" && (
        <div className="space-y-2">
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <AssetFilter allSymbols={allSymbols} selected={filterSyms} onChange={setFilterSyms} />
            <button className="btn secondary" onClick={handleRefresh} style={{ padding: "6px 10px", fontSize: 11 }}>↻ Refresh</button>
            <button className="btn secondary" onClick={() => setShowColConfig(v => !v)} style={{ padding: "6px 10px", fontSize: 11 }}>⚙ Columns</button>
            <button
              className="btn secondary"
              onClick={() => setViewMode(v => v === "dca" ? "lot" : "dca")}
              style={{ padding: "6px 10px", fontSize: 11 }}
            >
              {isLotView ? "📊 DCA View" : "📦 Lot View"}
            </button>
            <span className="pill" style={{ marginLeft: "auto" }}>Live prices · Top 500</span>
          </div>

          {/* Desktop Table */}
          {!isMobile ? (
            <div className="panel">
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      {colOrder.filter(k => visibleCols.has(k)).map(key => {
                        const col = ALL_COLUMNS.find(c => c.key === key);
                        if (!col) return null;
                        const label = <span style={{ color: "var(--brand)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{col.label}</span>;
                        if (key === "actions") return <th key={key} style={{ width: 70 }}></th>;
                        return ["price", "total", "allocation", "avg", "pnl", "qty"].includes(key)
                          ? <SortTh key={key} col={key} label={col.label} />
                          : <th key={key}>{label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={24} className="muted" style={{ textAlign: "center", padding: 32 }}>No assets. Import trades in the Ledger.</td></tr>
                    ) : sorted.map((pos, i) => {
                      const alloc = totalMV > 0 ? (pos.total / totalMV) * 100 : 0;
                      const isExpanded = expandedAssets.has(pos.sym);

                      const cellMap: Record<string, React.ReactNode> = {
                        rank: <td key="rank" className="mono muted">{i + 1}</td>,
                        asset: (
                          <td key="asset" onClick={() => setDrilldownSym(pos.sym)} style={{ cursor: "pointer" }}>
                            {isLotView && <span onClick={e => { e.stopPropagation(); toggleExpand(pos.sym); }} style={{ marginRight: 6 }}>{isExpanded ? "▾" : "▸"}</span>}
                            <span className="mono" style={{ fontWeight: 900 }}>{pos.sym}</span>
                          </td>
                        ),
                        sparkline: (
                          <td key="sparkline" onClick={() => setDrilldownSym(pos.sym)} style={{ cursor: "pointer" }}>
                            <Sparkline data={sparkData.get(pos.coinId) ?? []} positive={pos.change7d >= 0} />
                          </td>
                        ),
                        amount: <td key="amount" className="mono">{fmtQty(pos.qty)}</td>,
                        change1h: <td key="change1h"><ChangePill val={pos.change1h} /></td>,
                        change24h: <td key="change24h"><ChangePill val={pos.change24h} /></td>,
                        change7d: <td key="change7d"><ChangePill val={pos.change7d} /></td>,
                        price: <td key="price" className="mono">{pos.price !== null ? "$" + fmtPx(pos.price) : "—"}</td>,
                        total: <td key="total" className="mono" style={{ fontWeight: 800 }}>{fmtFiat(pos.total, base)}</td>,
                        allocation: <td key="allocation" className="mono">{alloc.toFixed(1)}%</td>,
                        avg: <td key="avg" className="mono">${fmtPx(pos.avg)}</td>,
                        pnl: (
                          <td key="pnl" style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 900, fontFamily: "var(--lt-font-mono)", color: pos.pnlAbs >= 0 ? "var(--good)" : "var(--bad)" }}>
                              {(pos.pnlAbs >= 0 ? "+" : "") + "$" + fmtFiat(Math.abs(pos.pnlAbs))}
                            </div>
                          </td>
                        ),
                        pnlPct: (
                          <td key="pnlPct">
                            <span className={`mono ${pos.pnlPct >= 0 ? "good" : "bad"}`} style={{ fontWeight: 700, fontSize: 11 }}>
                              {pos.pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pos.pnlPct).toFixed(2)}%
                            </span>
                          </td>
                        ),
                        breakEven: (
                          <td key="breakEven" className="mono">
                            <div style={{ fontWeight: 800 }}>${fmtPx(pos.breakEven)}</div>
                          </td>
                        ),
                        actions: (
                          <td key="actions" style={{ textAlign: "center" }}>
                            <button
                              style={{
                                padding: "6px 14px", fontSize: 11, fontWeight: 800, letterSpacing: "0.02em",
                                background: "#d97706", color: "#fff", border: "none", borderRadius: 6,
                                cursor: "pointer", textTransform: "uppercase",
                                transition: "opacity 0.15s",
                              }}
                              onClick={e => { e.stopPropagation(); setSellPos(pos); }}
                            >
                              Sell
                            </button>
                          </td>
                        ),
                      };

                      const mainRow = <tr key={pos.sym}>{colOrder.filter(k => visibleCols.has(k)).map(k => cellMap[k])}</tr>;
                      if (!isExpanded || !isLotView) return mainRow;

                      return [mainRow, ...pos.lots.map(lot => (
                        <tr key={lot.id} style={{ background: "var(--panel2)" }}>
                          <td colSpan={2} style={{ paddingLeft: 24, fontSize: 11 }} className="muted">{new Date(lot.ts).toLocaleDateString()}</td>
                          <td className="mono" style={{ fontSize: 11 }}>{fmtQty(lot.qtyRem)}</td>
                          <td colSpan={10} className="mono muted" style={{ fontSize: 11 }}>Cost: ${fmtPx(lot.unitCost)}</td>
                        </tr>
                      ))];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Mobile Cards */
            <div className="flex flex-col gap-2">
              {sorted.length === 0 ? (
                <div className="muted text-center py-8">No assets found.</div>
              ) : sorted.map(pos => <MobileCard key={pos.sym} pos={pos} />)}
            </div>
          )}
        </div>
      )}

      {drilldownSym && <AssetDrilldown sym={drilldownSym} onClose={() => setDrilldownSym(null)} />}
      {sellPos && <SellDialog pos={sellPos} base={base} onClose={() => setSellPos(null)} />}
    </div>
  );
}
