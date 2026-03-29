import { useState } from "react";

interface FAQItem {
  q: string;
  a: string;
  category: string;
}

const FAQ_DATA: FAQItem[] = [
  // Getting Started
  { category: "Getting Started", q: "How do I add my first transaction?", a: "Navigate to the Ledger page and use the Manual Entry form. Select a coin, fill in the transaction details (type, quantity, price), and click Save. Your portfolio will update automatically." },
  { category: "Getting Started", q: "How do I import CSV files from my exchange?", a: "Go to the Ledger page and switch to the Import tab. Upload a CSV export from Binance, Bybit, OKX, Gate.io, KuCoin, or MEXC. The system auto-detects the format, shows a preview, and imports valid rows." },
  { category: "Getting Started", q: "What exchanges are supported for CSV import?", a: "Currently supported: Binance (Spot Trade History), Bybit, OKX, Gate.io, KuCoin, and MEXC. Each adapter auto-detects the file format." },

  // Portfolio & Tracking
  { category: "Portfolio", q: "What's the difference between FIFO and DCA tracking?", a: "FIFO (First-In-First-Out) matches sells against your earliest purchases, calculating realized P&L per lot. DCA (Dollar Cost Average) tracks your average cost basis across all buys. Switch between them in Settings." },
  { category: "Portfolio", q: "Why does my portfolio value show $0?", a: "This usually means live prices haven't loaded yet or your assets aren't mapped to price feeds. Check your internet connection and ensure the assets you hold are in the supported asset list." },
  { category: "Portfolio", q: "How are unrealized P&L and realized P&L calculated?", a: "Unrealized P&L = (Current Price − Avg Cost) × Quantity held. Realized P&L is computed when you sell, matching against cost lots (FIFO) or average cost (DCA). Both are shown in the Portfolio page." },

  // Charts & Analytics
  { category: "Charts", q: "Where can I see detailed price charts?", a: "Go to Charts & Analytics → Price Charts tab. You'll see 7-day sparklines for each asset. Select up to 5 assets to compare their performance on a normalized % change chart." },
  { category: "Charts", q: "What do the risk metrics mean?", a: "Sharpe Ratio measures risk-adjusted return (>1 is good). Volatility shows price swings (annualized). Max Drawdown is the largest peak-to-trough decline. Win Rate tracks the % of days with positive returns." },

  // Alerts
  { category: "Alerts", q: "How do price alerts work?", a: "Go to the Alerts page and add a price alert. Set a symbol, threshold, and direction (above/below). When the live price crosses your threshold, you'll be notified. Alerts run in the browser while the app is open." },
  { category: "Alerts", q: "Can I get alerts via email or Telegram?", a: "Currently alerts are browser-based. Email and Telegram channels are planned features — the settings UI is ready for when those integrations are added." },

  // Tools
  { category: "Tools", q: "How does the Trade Calculator work?", a: "Enter your entry price, exit price, quantity, leverage, and fee %. The calculator shows your net P&L, ROI, and estimated liquidation price (for leveraged trades)." },
  { category: "Tools", q: "What's the Market Cap Calculator for?", a: "It answers 'What if [coin] reached [price]?' by calculating the implied market cap, or vice versa. Useful for evaluating price targets against realistic market cap levels." },

  // Data & Settings
  { category: "Data", q: "Where is my data stored?", a: "Your transactions and portfolio data are stored in a secure Supabase Postgres database linked to your account. Theme preferences and layout settings are cached locally in your browser." },
  { category: "Data", q: "How do I back up my data?", a: "Go to Settings → Data Management and click 'Export Backup'. This downloads a JSON file with your full app state. You can also take named snapshots in the Vault section of Settings for quick restore points." },
  { category: "Data", q: "Can I import data from another portfolio tracker?", a: "Currently, CSV import from major exchanges is supported. For other trackers, export your data as CSV in a compatible format. The system expects standard trade history fields (date, pair, side, quantity, price)." },
  { category: "Data", q: "How do I change the base currency?", a: "Go to Settings and look for the Base Currency section. Choose from USD, EUR, GBP, or QAR. Note: prices are fetched in USD and converted where applicable." },
];

const CATEGORIES = [...new Set(FAQ_DATA.map(f => f.category))];

const TROUBLESHOOTING = [
  { issue: "Prices not loading", steps: "1. Check your internet connection\n2. Refresh the page\n3. Wait 30 seconds — CoinGecko has rate limits\n4. Check if the asset is in the supported list" },
  { issue: "CSV import shows 0 valid rows", steps: "1. Ensure the file is from a supported exchange\n2. Check that it's a Spot Trade History export (not funding/margin)\n3. Verify the file isn't empty or corrupted\n4. Try re-exporting from the exchange" },
  { issue: "Duplicate transactions after import", steps: "The system uses SHA-256 file hashing and external_id indexing to prevent duplicates. If you see duplicates:\n1. Check if you imported from different export files covering the same period\n2. Use the Ledger to delete unwanted entries" },
  { issue: "App looks broken or unstyled", steps: "1. Try a different layout in Settings\n2. Clear browser cache (Ctrl+Shift+Delete)\n3. Try a different browser\n4. Check for browser extensions that might interfere" },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>("Getting Started");
  const [openTrouble, setOpenTrouble] = useState<number | null>(null);

  const filtered = search.trim()
    ? FAQ_DATA.filter(f => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ_DATA;

  const groupedByCategory = CATEGORIES.map(cat => ({
    category: cat,
    items: filtered.filter(f => f.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>Help & Documentation</h2>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>FAQ, troubleshooting, and feature guides</p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input className="inp" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search help articles..." style={{ width: "100%", fontSize: 13, padding: "10px 14px" }} />
      </div>

      {/* FAQ */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>❓ Frequently Asked Questions</h2><span className="pill">{filtered.length} articles</span></div>
        <div className="panel-body">
          {groupedByCategory.map(group => (
            <div key={group.category} style={{ marginBottom: 12 }}>
              <button
                onClick={() => setOpenCategory(openCategory === group.category ? null : group.category)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand)", fontWeight: 700, fontSize: 12, padding: "4px 0", display: "flex", alignItems: "center", gap: 6, width: "100%" }}
              >
                <span style={{ transform: openCategory === group.category ? "rotate(90deg)" : "none", transition: "0.15s", display: "inline-block" }}>▶</span>
                {group.category} ({group.items.length})
              </button>
              {openCategory === group.category && (
                <div style={{ marginLeft: 16, borderLeft: "2px solid var(--line)", paddingLeft: 12 }}>
                  {group.items.map((faq, i) => (
                    <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--line2)" }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)", marginBottom: 4 }}>{faq.q}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>{faq.a}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>No results for "{search}"</div>}
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>🔧 Troubleshooting</h2></div>
        <div className="panel-body">
          {TROUBLESHOOTING.map((t, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <button
                onClick={() => setOpenTrouble(openTrouble === i ? null : i)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontWeight: 700, fontSize: 12, padding: "6px 0", display: "flex", alignItems: "center", gap: 6, width: "100%" }}
              >
                <span style={{ transform: openTrouble === i ? "rotate(90deg)" : "none", transition: "0.15s", display: "inline-block" }}>▶</span>
                {t.issue}
              </button>
              {openTrouble === i && (
                <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: "2px solid var(--line)", marginBottom: 8 }}>
                  <pre style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{t.steps}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="panel">
        <div className="panel-head"><h2>🔗 Resources</h2></div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {[
              { icon: "📖", title: "Feature Guide", desc: "Learn about every feature in the app", link: "#" },
              { icon: "🎨", title: "Theme Gallery", desc: "8 layouts × 5 themes = 40 combinations", link: "#" },
              { icon: "📊", title: "Supported Exchanges", desc: "Binance, Bybit, OKX, Gate.io, KuCoin, MEXC", link: "#" },
              { icon: "🔐", title: "Security", desc: "How your data is stored and protected", link: "#" },
            ].map(r => (
              <div key={r.title} style={{ background: "var(--panel2)", borderRadius: 8, padding: 14, cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{r.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)", marginBottom: 2 }}>{r.title}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
