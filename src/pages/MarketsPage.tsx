import { useState, useMemo, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices } from "@/hooks/useLivePrices";
import HeatmapGrid from "@/components/markets/HeatmapGrid";

const TIME_RANGES = [
  { key: "1h", label: "1 H" },
  { key: "24h", label: "24 H" },
  { key: "7d", label: "7 D" },
];

const COIN_COUNTS = [50, 100, 200];

const SORT_OPTIONS = [
  { key: "market_cap", label: "Market Cap" },
  { key: "change", label: "Top Movers" },
  { key: "volume", label: "Volume" },
  { key: "losers", label: "Top Losers" },
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
  const [timeRange, setTimeRange] = useState("24h");
  const [coinCount, setCoinCount] = useState(100);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("market_cap");

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

    const getChange = (c: typeof allCoins[0]) => {
      switch (timeRange) {
        case "1h": return c.price_change_percentage_1h_in_currency || 0;
        case "7d": return c.price_change_percentage_7d_in_currency || 0;
        default: return c.price_change_percentage_24h_in_currency || 0;
      }
    };

    switch (sortBy) {
      case "change":
        filtered = [...filtered].sort((a, b) => Math.abs(getChange(b)) - Math.abs(getChange(a)));
        break;
      case "volume":
        filtered = [...filtered].sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0));
        break;
      case "losers":
        filtered = [...filtered].sort((a, b) => getChange(a) - getChange(b));
        break;
      default:
        // already sorted by market cap
        break;
    }

    return filtered.slice(0, search.trim() ? 500 : coinCount);
  }, [allCoins, search, coinCount, sortBy, timeRange]);

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
          <input
            className="markets-search"
            type="text"
            placeholder="Search coin…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="seg">
            {SORT_OPTIONS.map(s => (
              <button
                key={s.key}
                className={sortBy === s.key ? "active" : ""}
                onClick={() => setSortBy(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
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
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="markets-loading">
          <div className="market-loading-spinner" />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>Loading market data…</span>
        </div>
      )}

      {/* Heatmap */}
      {!loading && (
        <HeatmapGrid coins={coins} timeRange={timeRange} watchSymbols={watchSymbols} />
      )}
    </div>
  );
}
