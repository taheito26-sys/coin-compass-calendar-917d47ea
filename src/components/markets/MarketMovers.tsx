/**
 * MarketMovers — Gainers/Losers split view inspired by CoinMarketCap
 */
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

function formatVol(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toFixed(0);
}

function MoverRow({ coin, change, rank }: { coin: LiveCoin; change: number; rank: number }) {
  const isPositive = change >= 0;
  return (
    <div className="mover-row">
      <span className="mover-rank">{rank}</span>
      <div className="mover-coin">
        {coin.image && <img src={coin.image} alt="" className="mover-icon" loading="lazy" />}
        <div>
          <span className="mover-sym">{coin.symbol.toUpperCase()}</span>
          <span className="mover-name">{coin.name}</span>
        </div>
      </div>
      <span className="mover-price mono">{formatPrice(coin.current_price)}</span>
      <span className={`mover-change mono ${isPositive ? "good" : "bad"}`}>
        {isPositive ? "+" : ""}{change.toFixed(2)}%
      </span>
      <span className="mover-vol mono">{formatVol(coin.total_volume || 0)}</span>
    </div>
  );
}

export default function MarketMovers({ coins, timeRange }: Props) {
  const withChange = coins.map(c => ({ coin: c, change: getChange(c, timeRange) }));
  const gainers = [...withChange].sort((a, b) => b.change - a.change).slice(0, 15);
  const losers = [...withChange].sort((a, b) => a.change - b.change).slice(0, 15);

  return (
    <div className="movers-split">
      <div className="panel movers-panel">
        <div className="panel-head">
          <h2 style={{ color: "var(--good)" }}>🟢 Top Gainers</h2>
          <span className="pill">{gainers.length}</span>
        </div>
        <div className="panel-body movers-list">
          <div className="mover-header">
            <span>#</span><span>Coin</span><span>Price</span><span>Change</span><span>Volume</span>
          </div>
          {gainers.map((g, i) => (
            <MoverRow key={g.coin.id} coin={g.coin} change={g.change} rank={i + 1} />
          ))}
        </div>
      </div>
      <div className="panel movers-panel">
        <div className="panel-head">
          <h2 style={{ color: "var(--bad)" }}>🔴 Top Losers</h2>
          <span className="pill">{losers.length}</span>
        </div>
        <div className="panel-body movers-list">
          <div className="mover-header">
            <span>#</span><span>Coin</span><span>Price</span><span>Change</span><span>Volume</span>
          </div>
          {losers.map((l, i) => (
            <MoverRow key={l.coin.id} coin={l.coin} change={l.change} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
