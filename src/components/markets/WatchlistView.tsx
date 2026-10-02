import { useMemo, useState } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";
import { useWatchlist } from "@/hooks/useWatchlist";

interface Props {
  coins: LiveCoin[];
  getPrice: (sym: string) => LiveCoin | null;
  timeRange: string;
}

function getChange(coin: LiveCoin | null, timeRange: string) {
  if (!coin) return null;
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency ?? null;
    case "7d": return coin.price_change_percentage_7d_in_currency ?? null;
    default: return coin.price_change_percentage_24h_in_currency ?? null;
  }
}

function formatPrice(p: number | null | undefined): string {
  if (p == null) return "—";
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

export default function WatchlistView({ coins, getPrice, timeRange }: Props) {
  const { watch, addToWatch, removeFromWatch } = useWatchlist();
  const [search, setSearch] = useState("");

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return coins
      .filter(c => !watch.includes(c.symbol.toUpperCase()))
      .filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [coins, search, watch]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>⭐ Watchlist</h2>
        <span className="pill">{watch.length}</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        <div style={{ padding: 10, borderBottom: "1px solid var(--line)", position: "relative" }}>
          <input
            className="markets-search"
            type="text"
            placeholder="Search a coin to add…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
          {suggestions.length > 0 && (
            <div style={{
              position: "absolute", left: 10, right: 10, top: "100%",
              background: "var(--panel)", border: "1px solid var(--line)",
              borderRadius: 8, zIndex: 5, boxShadow: "0 12px 40px rgba(0,0,0,.25)",
              maxHeight: 260, overflowY: "auto",
            }}>
              {suggestions.map(c => (
                <div
                  key={c.id}
                  onClick={() => { addToWatch(c.symbol); setSearch(""); }}
                  style={{
                    padding: "8px 10px", cursor: "pointer", fontSize: 12,
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: "1px solid var(--line2)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--brand3, rgba(79,70,229,.06))")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {c.image && <img src={c.image} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} loading="lazy" />}
                  <span style={{ fontWeight: 800 }}>{c.symbol.toUpperCase()}</span>
                  <span style={{ color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{formatPrice(c.current_price)}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)" }}>+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {watch.length === 0 ? (
          <div className="muted" style={{ padding: 30, textAlign: "center" }}>
            No coins in your watchlist yet. Search above to add your first one.
          </div>
        ) : (
          <div className="movers-list">
            <div className="mover-header" style={{ gridTemplateColumns: "30px 1fr 80px 70px 70px 28px" }}>
              <span>#</span><span>Coin</span><span>Price</span><span>Change</span><span>Volume</span><span />
            </div>
            {watch.map((sym, i) => {
              const live = getPrice(sym);
              const change = getChange(live, timeRange);
              const positive = (change ?? 0) >= 0;
              return (
                <div key={sym} className="mover-row" style={{ gridTemplateColumns: "30px 1fr 80px 70px 70px 28px" }}>
                  <span className="mover-rank">{i + 1}</span>
                  <div className="mover-coin">
                    {live?.image && <img src={live.image} alt="" className="mover-icon" loading="lazy" />}
                    <div>
                      <span className="mover-sym">{sym}</span>
                      <span className="mover-name">{live?.name || ""}</span>
                    </div>
                  </div>
                  <span className="mover-price mono">{formatPrice(live?.current_price)}</span>
                  <span className={`mover-change mono ${change == null ? "" : positive ? "good" : "bad"}`}>
                    {change == null ? "—" : `${positive ? "+" : ""}${change.toFixed(2)}%`}
                  </span>
                  <span className="mover-vol mono">
                    {live?.total_volume ? (live.total_volume >= 1e9 ? "$" + (live.total_volume / 1e9).toFixed(1) + "B" : "$" + (live.total_volume / 1e6).toFixed(0) + "M") : "—"}
                  </span>
                  <button
                    className="btn tiny secondary"
                    title="Remove from watchlist"
                    onClick={() => removeFromWatch(sym)}
                    style={{ padding: "2px 6px", fontSize: 11, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
