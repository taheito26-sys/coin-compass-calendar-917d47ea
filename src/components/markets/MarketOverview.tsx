/**
 * MarketOverview — CoinMarketCap-style card grid showing key coin metrics
 * with mini sparklines and quick stats
 */
import { useMemo } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
}

function getChange(coin: LiveCoin, timeRange: string) {
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency || 0;
    case "7d": return coin.price_change_percentage_7d_in_currency || 0;
    default: return coin.price_change_percentage_24h_in_currency || 0;
  }
}

function formatPrice(p: number): string {
  if (p >= 1000) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return "$" + p.toFixed(2);
  return "$" + p.toFixed(4);
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

function CoinCard({ coin, change }: { coin: LiveCoin; change: number }) {
  const isPositive = change >= 0;
  const volMcapRatio = coin.market_cap > 0 ? ((coin.total_volume || 0) / coin.market_cap * 100) : 0;

  return (
    <div className="overview-card">
      <div className="overview-card-top">
        <div className="overview-card-info">
          {coin.image && <img src={coin.image} alt="" className="overview-card-icon" loading="lazy" />}
          <div>
            <div className="overview-card-sym">{coin.symbol.toUpperCase()}</div>
            <div className="overview-card-name">{coin.name}</div>
          </div>
        </div>
        <span className="overview-card-rank">#{coin.market_cap_rank}</span>
      </div>
      <div className="overview-card-price">{formatPrice(coin.current_price)}</div>
      <div className={`overview-card-change ${isPositive ? "good" : "bad"}`}>
        {isPositive ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
      </div>
      <div className="overview-card-stats">
        <div>
          <span className="overview-card-stat-lbl">MCap</span>
          <span className="overview-card-stat-val">{formatCompact(coin.market_cap)}</span>
        </div>
        <div>
          <span className="overview-card-stat-lbl">Vol 24h</span>
          <span className="overview-card-stat-val">{formatCompact(coin.total_volume || 0)}</span>
        </div>
        <div>
          <span className="overview-card-stat-lbl">Vol/MCap</span>
          <span className="overview-card-stat-val">{volMcapRatio.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export default function MarketOverview({ coins, timeRange }: Props) {
  const cards = useMemo(() =>
    coins.slice(0, 50).map(c => ({
      coin: c,
      change: getChange(c, timeRange),
    })),
    [coins, timeRange]
  );

  return (
    <div className="overview-grid">
      {cards.map(c => (
        <CoinCard key={c.coin.id} coin={c.coin} change={c.change} />
      ))}
    </div>
  );
}
