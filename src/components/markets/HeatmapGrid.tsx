import { useMemo, useState } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
  watchSymbols?: string[];
}

function getChange(coin: LiveCoin, timeRange: string) {
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency || 0;
    case "7d": return coin.price_change_percentage_7d_in_currency || 0;
    default: return coin.price_change_percentage_24h_in_currency || 0;
  }
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + p.toFixed(6);
}

function formatPnl(p: number): string {
  const sign = p >= 0 ? "+" : "-";
  const abs = Math.abs(p);
  if (abs >= 1000) return sign + "$" + abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 1) return sign + "$" + abs.toFixed(2);
  if (abs >= 0.01) return sign + "$" + abs.toFixed(4);
  return sign + "$" + abs.toFixed(6);
}

function formatVol(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toFixed(0);
}

function getHeatColor(change: number): string {
  const clamped = Math.max(-12, Math.min(12, change));
  const t = (clamped + 12) / 24;
  if (t < 0.35) {
    const intensity = (0.35 - t) / 0.35;
    return `hsla(0, 72%, ${18 + intensity * 22}%, ${0.6 + intensity * 0.4})`;
  }
  if (t > 0.65) {
    const intensity = (t - 0.65) / 0.35;
    return `hsla(145, 62%, ${16 + intensity * 20}%, ${0.6 + intensity * 0.4})`;
  }
  return "hsla(220, 10%, 14%, 0.5)";
}

function getChangeColor(change: number): string {
  if (change > 0.3) return "var(--good)";
  if (change < -0.3) return "var(--bad)";
  return "var(--muted)";
}

function getTileSize(rank: number, total: number): "xl" | "lg" | "md" | "sm" {
  if (rank <= 2) return "xl";
  if (rank <= 6) return "lg";
  if (rank <= 20) return "md";
  return "sm";
}

export default function HeatmapGrid({ coins, timeRange, watchSymbols = [] }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const tiles = useMemo(() => {
    return coins.map((coin, i) => {
      const change = getChange(coin, timeRange);
      const size = getTileSize(i + 1, coins.length);
      const isWatched = watchSymbols.includes(coin.symbol.toUpperCase());
      const pnlUsd = coin.current_price * (change / (100 + change));
      return { ...coin, change, size, isWatched, pnlUsd };
    });
  }, [coins, timeRange, watchSymbols]);

  if (!tiles.length) {
    return (
      <div className="panel">
        <div className="panel-body" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No coins match your search.
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap-v2">
      <div className="heatmap-v2-grid">
        {tiles.map(coin => {
          const isHovered = hoveredId === coin.id;
          const sizeClass = `heatmap-v2-tile--${coin.size}`;

          return (
            <div
              key={coin.id}
              className={`heatmap-v2-tile ${sizeClass}${coin.isWatched ? " heatmap-v2-tile--watched" : ""}${isHovered ? " heatmap-v2-tile--hover" : ""}`}
              style={{ background: getHeatColor(coin.change) }}
              onMouseEnter={() => setHoveredId(coin.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {coin.isWatched && <span className="heatmap-v2-star">★</span>}
              <div className="heatmap-v2-tile-top">
                {coin.image && (
                  <img
                    src={coin.image}
                    alt=""
                    className="heatmap-v2-icon"
                    loading="lazy"
                  />
                )}
                <span className="heatmap-v2-symbol">{coin.symbol.toUpperCase()}</span>
                {(coin.size === "xl" || coin.size === "lg") && (
                  <span className="heatmap-v2-rank">#{coin.market_cap_rank}</span>
                )}
              </div>

              <div className="heatmap-v2-change" style={{ color: getChangeColor(coin.change) }}>
                {coin.change >= 0 ? "+" : ""}{coin.change.toFixed(2)}%
              </div>

              {coin.size !== "sm" && (
                <div className="heatmap-v2-pnl">{formatPnl(coin.pnlUsd)}</div>
              )}

              {(coin.size === "xl" || coin.size === "lg" || isHovered) && (
                <div className="heatmap-v2-details">
                  <span className="heatmap-v2-price">{formatPrice(coin.current_price)}</span>
                  <span className="heatmap-v2-mcap">{formatCompact(coin.market_cap)}</span>
                </div>
              )}

              {coin.size === "xl" && (
                <div className="heatmap-v2-extra">
                  <span>Vol {formatVol(coin.total_volume || 0)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
