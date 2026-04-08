import { useState, useMemo } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import HeatmapGrid from "@/components/markets/HeatmapGrid";
import MarketMovers from "@/components/markets/MarketMovers";
import MarketOverview from "@/components/markets/MarketOverview";
import MarketCategories from "@/components/markets/MarketCategories";

const TIME_RANGES = [
  { key: "1h", label: "1 H" },
  { key: "24h", label: "24 H" },
  { key: "7d", label: "7 D" },
];

const COIN_COUNTS = [50, 100, 200];

type ViewMode = "heatmap" | "movers" | "overview" | "categories";

const VIEWS: { key: ViewMode; icon: string; label: string }[] = [
  { key: "heatmap", icon: "▦", label: "Heatmap" },
  { key: "movers", icon: "⇅", label: "Movers" },
  { key: "overview", icon: "◫", label: "Overview" },
  { key: "categories", icon: "◧", label: "Sectors" },
];

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

export default function MarketsPage() {
  const { state } = useCrypto();
  const { coins: allCoins, loading } = useLivePrices();
  const [view, setView] = useState<ViewMode>("heatmap");
  const [timeRange, setTimeRange] = useState("24h");
  const [coinCount, setCoinCount] = useState(100);
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    if (!allCoins.length) return null;
    const totalMcap = allCoins.reduce((s, c) => s + (c.market_cap || 0), 0);
    const totalVol = allCoins.reduce((s, c) => s + (c.total_volume || 0), 0);
    const btc = allCoins.find(c => c.symbol === "btc");
    const eth = allCoins.find(c => c.symbol === "eth");
    const btcDom = btc && totalMcap > 0 ? ((btc.market_cap || 0) / totalMcap * 100) : 0;
    const ethDom = eth && totalMcap > 0 ? ((eth.market_cap || 0) / totalMcap * 100) : 0;
    const gainers = allCoins.filter(c => (c.price_change_percentage_24h_in_currency || 0) > 0).length;
    const losers = allCoins.filter(c => (c.price_change_percentage_24h_in_currency || 0) < 0).length;
    return { totalMcap, totalVol, btcDom, ethDom, gainers, losers };
  }, [allCoins]);

  const coins = useMemo(() => {
    let filtered = allCoins;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(c =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      );
    }
    return filtered.slice(0, search.trim() ? 500 : coinCount);
  }, [allCoins, search, coinCount]);

  const watchSymbols = state.watch;

  return (
    <div className="markets-redesign">
      {/* Stats ribbon */}
      {stats && (
        <div className="markets-stats-ribbon">
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">Total MCap</span>
            <span className="markets-stat-val">{formatCompact(stats.totalMcap)}</span>
          </div>
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">24h Volume</span>
            <span className="markets-stat-val">{formatCompact(stats.totalVol)}</span>
          </div>
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">BTC Dom</span>
            <span className="markets-stat-val">{stats.btcDom.toFixed(1)}%</span>
          </div>
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">ETH Dom</span>
            <span className="markets-stat-val">{stats.ethDom.toFixed(1)}%</span>
          </div>
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">Gainers</span>
            <span className="markets-stat-val" style={{ color: "var(--good)" }}>{stats.gainers}</span>
          </div>
          <div className="markets-stat-chip">
            <span className="markets-stat-lbl">Losers</span>
            <span className="markets-stat-val" style={{ color: "var(--bad)" }}>{stats.losers}</span>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="markets-toolbar">
        <div className="markets-toolbar-left">
          <div className="seg">
            {VIEWS.map(v => (
              <button
                key={v.key}
                className={view === v.key ? "active" : ""}
                onClick={() => setView(v.key)}
              >
                <span style={{ fontSize: 11 }}>{v.icon}</span> {v.label}
              </button>
            ))}
          </div>
          <input
            className="markets-search"
            type="text"
            placeholder="Search coin…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="markets-toolbar-right">
          <div className="seg">
            {TIME_RANGES.map(t => (
              <button
                key={t.key}
                className={timeRange === t.key ? "active" : ""}
                onClick={() => setTimeRange(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {view !== "categories" && (
            <div className="seg">
              {COIN_COUNTS.map(n => (
                <button
                  key={n}
                  className={coinCount === n ? "active" : ""}
                  onClick={() => setCoinCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="markets-loading">
          <div className="market-loading-spinner" />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading market data…</span>
        </div>
      )}

      {/* Views */}
      {!loading && view === "heatmap" && (
        <HeatmapGrid coins={coins} timeRange={timeRange} watchSymbols={watchSymbols} />
      )}
      {!loading && view === "movers" && (
        <MarketMovers coins={coins} timeRange={timeRange} />
      )}
      {!loading && view === "overview" && (
        <MarketOverview coins={coins} timeRange={timeRange} />
      )}
      {!loading && view === "categories" && (
        <MarketCategories coins={allCoins} timeRange={timeRange} />
      )}
    </div>
  );
}
