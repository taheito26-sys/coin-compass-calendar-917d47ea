/**
 * MarketCategories — Sector/category performance view
 * Groups coins by category and shows aggregate performance
 */
import { useMemo } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
}

// Common crypto categories
const CATEGORY_MAP: Record<string, string[]> = {
  "Layer 1": ["BTC", "ETH", "SOL", "ADA", "AVAX", "DOT", "NEAR", "APT", "SUI", "TON", "ATOM", "ALGO", "XLM", "HBAR", "FTM", "ICP", "SEI", "TIA", "EGLD", "FLOW"],
  "Layer 2": ["MATIC", "ARB", "OP", "IMX", "MINA", "STX"],
  "DeFi": ["UNI", "AAVE", "MKR", "CRV", "SNX", "COMP", "SUSHI", "YFI", "BAL", "DYDX", "GMX", "PENDLE", "INJ", "RUNE", "LDO", "RPL"],
  "Meme": ["DOGE", "SHIB", "PEPE", "WIF", "FLOKI", "BONK"],
  "AI & Data": ["RNDR", "FET", "OCEAN", "WLD", "TAO", "AR", "GRT", "AGIX"],
  "Gaming & NFT": ["AXS", "SAND", "MANA", "GALA", "ENJ", "CHZ", "THETA", "APE", "BLUR"],
  "Infrastructure": ["LINK", "QNT", "VET", "ROSE", "ANKR", "ENS", "1INCH", "HNT"],
  "Exchange": ["BNB", "OKB", "CRO", "LEO"],
  "Privacy": ["XMR", "ZEC", "DASH"],
  "Payments": ["XRP", "LTC", "BCH", "TRX"],
};

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

interface CategoryData {
  name: string;
  coins: { coin: LiveCoin; change: number }[];
  avgChange: number;
  totalMcap: number;
  totalVol: number;
  topGainer: { sym: string; change: number } | null;
  topLoser: { sym: string; change: number } | null;
}

export default function MarketCategories({ coins, timeRange }: Props) {
  const categories = useMemo(() => {
    const coinMap = new Map(coins.map(c => [c.symbol.toUpperCase(), c]));
    const results: CategoryData[] = [];

    for (const [catName, symbols] of Object.entries(CATEGORY_MAP)) {
      const catCoins = symbols
        .map(sym => coinMap.get(sym))
        .filter(Boolean)
        .map(c => ({ coin: c!, change: getChange(c!, timeRange) }));

      if (catCoins.length === 0) continue;

      const avgChange = catCoins.reduce((s, c) => s + c.change, 0) / catCoins.length;
      const totalMcap = catCoins.reduce((s, c) => s + (c.coin.market_cap || 0), 0);
      const totalVol = catCoins.reduce((s, c) => s + (c.coin.total_volume || 0), 0);

      const sorted = [...catCoins].sort((a, b) => b.change - a.change);
      const topGainer = sorted[0] ? { sym: sorted[0].coin.symbol.toUpperCase(), change: sorted[0].change } : null;
      const topLoser = sorted[sorted.length - 1] ? { sym: sorted[sorted.length - 1].coin.symbol.toUpperCase(), change: sorted[sorted.length - 1].change } : null;

      results.push({ name: catName, coins: catCoins, avgChange, totalMcap, totalVol, topGainer, topLoser });
    }

    return results.sort((a, b) => b.avgChange - a.avgChange);
  }, [coins, timeRange]);

  return (
    <div className="categories-grid">
      {categories.map(cat => {
        const isPositive = cat.avgChange >= 0;
        return (
          <div key={cat.name} className="category-card panel">
            <div className="category-card-head">
              <h3 className="category-card-name">{cat.name}</h3>
              <span className={`category-card-change mono ${isPositive ? "good" : "bad"}`}>
                {isPositive ? "+" : ""}{cat.avgChange.toFixed(2)}%
              </span>
            </div>
            <div className="category-card-stats">
              <div>
                <span className="category-stat-lbl">MCap</span>
                <span className="category-stat-val">{formatCompact(cat.totalMcap)}</span>
              </div>
              <div>
                <span className="category-stat-lbl">Vol 24h</span>
                <span className="category-stat-val">{formatCompact(cat.totalVol)}</span>
              </div>
              <div>
                <span className="category-stat-lbl">Coins</span>
                <span className="category-stat-val">{cat.coins.length}</span>
              </div>
            </div>
            <div className="category-card-movers">
              {cat.topGainer && (
                <span className="category-mover good">
                  ▲ {cat.topGainer.sym} +{cat.topGainer.change.toFixed(1)}%
                </span>
              )}
              {cat.topLoser && cat.topLoser.change < 0 && (
                <span className="category-mover bad">
                  ▼ {cat.topLoser.sym} {cat.topLoser.change.toFixed(1)}%
                </span>
              )}
            </div>
            {/* Mini bar chart of coins in category */}
            <div className="category-bars">
              {cat.coins.slice(0, 8).map(c => {
                const pct = Math.min(100, Math.max(5, Math.abs(c.change) * 5 + 10));
                return (
                  <div key={c.coin.id} className="category-bar-row">
                    <span className="category-bar-sym">{c.coin.symbol.toUpperCase()}</span>
                    <div className="category-bar-track">
                      <div
                        className={`category-bar-fill ${c.change >= 0 ? "good" : "bad"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`category-bar-val mono ${c.change >= 0 ? "good" : "bad"}`}>
                      {c.change >= 0 ? "+" : ""}{c.change.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
