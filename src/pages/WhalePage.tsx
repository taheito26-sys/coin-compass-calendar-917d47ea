import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────
interface WhaleAlert {
  id: string;
  blockchain: string;
  symbol: string;
  amount: number;
  amount_usd: number;
  from: string;
  to: string;
  timestamp: number;
  transaction_type: string;
  tx_hash?: string;
}

type FeedSource = "live" | "cached" | "demo";

// ── Known address labels ────────────────────────────────────────────
const KNOWN_ADDRESSES: Record<string, string> = {
  // Bitcoin
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3": "Binance Hot Wallet",
  "bc1qa5wkgaew2dkv56kc6hp23mfpw4h5dj7q7j9v9j": "Coinbase",
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": "Satoshi Nakamoto",
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": "Bitfinex",
  "bc1qjasf9z3h7w3jspkhtg5pqsp5gca5wkee3e9at0": "Kraken",
  // Ethereum
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance 7",
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance 8",
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": "Coinbase 10",
  "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase 1",
  "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503": "Binance 0x47",
  "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2": "FTX (Seized)",
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": "Binance 3",
  "0xf977814e90da44bfa03b6295a0616a897441acec": "Binance 8",
  "0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0": "Justin Sun",
  Bitcoin: "Bitcoin mempool",
  "Pending outputs": "Pending",
  "Pending": "Pending",
};

function labelAddress(addr: string): { label: string | null; isExchange: boolean } {
  const low = addr.toLowerCase();
  for (const [known, label] of Object.entries(KNOWN_ADDRESSES)) {
    if (low === known.toLowerCase() || addr === known) {
      const isExchange = /binance|coinbase|kraken|bitfinex|ftx|okx|bybit|kucoin|gate/i.test(label);
      return { label, isExchange };
    }
  }
  return { label: null, isExchange: false };
}

// ── Constants ───────────────────────────────────────────────────────
const CHAIN_ICONS: Record<string, string> = {
  bitcoin: "₿", ethereum: "Ξ", litecoin: "Ł", dogecoin: "Ð",
  "bitcoin-cash": "₿C", solana: "◎", avalanche: "▲", polkadot: "●",
  dash: "⟐", zcash: "Ⓩ", "bitcoin-sv": "₿S", groestlcoin: "G",
};

const CHAIN_COLORS: Record<string, string> = {
  bitcoin: "hsl(38 92% 50%)",
  ethereum: "hsl(224 76% 48%)",
  litecoin: "hsl(220 8% 56%)",
  dogecoin: "hsl(43 96% 56%)",
  "bitcoin-cash": "hsl(145 63% 42%)",
  solana: "hsl(270 80% 60%)",
  avalanche: "hsl(0 84% 60%)",
  polkadot: "hsl(328 77% 57%)",
  dash: "hsl(207 90% 54%)",
  zcash: "hsl(40 100% 50%)",
  "bitcoin-sv": "hsl(195 53% 50%)",
  groestlcoin: "hsl(210 60% 45%)",
};

const EXPLORER_BASE: Record<string, string> = {
  bitcoin: "https://blockchair.com/bitcoin/transaction/",
  ethereum: "https://etherscan.io/tx/",
  litecoin: "https://blockchair.com/litecoin/transaction/",
  dogecoin: "https://blockchair.com/dogecoin/transaction/",
  "bitcoin-cash": "https://blockchair.com/bitcoin-cash/transaction/",
  solana: "https://solscan.io/tx/",
  dash: "https://blockchair.com/dash/transaction/",
  zcash: "https://blockchair.com/zcash/transaction/",
  "bitcoin-sv": "https://blockchair.com/bitcoin-sv/transaction/",
  groestlcoin: "https://blockchair.com/groestlcoin/transaction/",
};

const TX_TYPE_ICONS: Record<string, string> = {
  transfer: "↔️", exchange_deposit: "📥", exchange_withdrawal: "📤",
  contract_call: "📜", swap: "🔄", mint: "🪙",
};

function fmtUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtAmount(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(v < 1 ? 4 : 2);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncAddr(s: string): string {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

// ── Mock data ───────────────────────────────────────────────────────
function getMockAlerts(): WhaleAlert[] {
  return [
    { id: "mock-1", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "0x28c6c06298d514db089934071355e5743bf21d60", to: "0x503828976d22510aad0201ac7ec88293211d23da", timestamp: Date.now() - 300000, transaction_type: "transfer" },
    { id: "mock-2", blockchain: "bitcoin", symbol: "BTC", amount: 800, amount_usd: 53900000, from: "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3", to: "bc1qa5wkgaew2dkv56kc6hp23mfpw4h5dj7q7j9v9j", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
    { id: "mock-3", blockchain: "dogecoin", symbol: "DOGE", amount: 250000000, amount_usd: 42500000, from: "D7vKmN3p...", to: "DQkweR5t...", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
    { id: "mock-4", blockchain: "ethereum", symbol: "ETH", amount: 8500, amount_usd: 29900000, from: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8", to: "0x0716a17fbaee714f1e6ab0f9d59edbc5f09815c0", timestamp: Date.now() - 4200000, transaction_type: "transfer" },
  ];
}

// ── Response normalizer ─────────────────────────────────────────────
function normalizeResponse(data: unknown): { alerts: WhaleAlert[]; source: FeedSource } {
  const payload = data && typeof data === "object" && "data" in data ? (data as { data?: unknown }).data ?? data : data;
  if (!payload || typeof payload !== "object") return { alerts: [], source: "demo" };
  const p = payload as { success?: boolean; source?: string; alerts?: WhaleAlert[] };
  if (p.success === false) return { alerts: [], source: "demo" };
  const alerts = Array.isArray(p.alerts) ? p.alerts : [];
  const source: FeedSource = p.source === "live" ? "live" : p.source === "cached" ? "cached" : alerts.length > 0 ? "live" : "demo";
  return { alerts, source };
}

// ── Sub-components ──────────────────────────────────────────────────
function StatusBadge({ source }: { source: FeedSource }) {
  const cfg = source === "live"
    ? { bg: "hsl(142 71% 45% / 0.15)", color: "hsl(142 71% 35%)", label: "● LIVE" }
    : source === "cached"
    ? { bg: "hsl(210 80% 55% / 0.15)", color: "hsl(210 80% 45%)", label: "● CACHED" }
    : { bg: "hsl(43 96% 56% / 0.15)", color: "hsl(38 92% 40%)", label: "● DEMO" };

  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "hsl(var(--muted) / 0.08)", borderColor: "hsl(var(--border))" }}>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</div>
      <div className="text-lg font-black mt-0.5" style={{ color: color || "hsl(var(--foreground))" }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{sub}</div>}
    </div>
  );
}

function ChainFilterPill({ chain, symbol, active, onClick, count }: { chain: string; symbol: string; active: boolean; onClick: () => void; count: number }) {
  const color = CHAIN_COLORS[chain] || "hsl(var(--muted-foreground))";
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer"
      style={{
        background: active ? `${color}22` : "transparent",
        borderColor: active ? color : "hsl(var(--border))",
        color: active ? color : "hsl(var(--muted-foreground))",
      }}
    >
      {CHAIN_ICONS[chain] || "●"} {symbol} ({count})
    </button>
  );
}

function AddressLabel({ address }: { address: string }) {
  const { label, isExchange } = labelAddress(address);
  if (!label) return <span className="font-mono">{truncAddr(address)}</span>;
  return (
    <span className="flex items-center gap-1">
      {isExchange && <span className="text-[8px]">🏛️</span>}
      <span className="font-bold" style={{ color: isExchange ? "hsl(210 80% 55%)" : "hsl(var(--foreground))" }}>{label}</span>
    </span>
  );
}

function WhaleCard({ alert, threshold }: { alert: WhaleAlert; threshold: number }) {
  const color = CHAIN_COLORS[alert.blockchain] || "hsl(var(--primary))";
  const explorerUrl = alert.tx_hash ? `${EXPLORER_BASE[alert.blockchain] || "https://blockchair.com/"}${alert.tx_hash}` : null;
  const isAboveThreshold = alert.amount_usd >= threshold;
  const fromInfo = labelAddress(alert.from);
  const toInfo = labelAddress(alert.to);
  const flowType = fromInfo.isExchange && !toInfo.isExchange ? "withdrawal" : !fromInfo.isExchange && toInfo.isExchange ? "deposit" : fromInfo.isExchange && toInfo.isExchange ? "inter-exchange" : "transfer";
  const flowIcon = flowType === "withdrawal" ? "📤" : flowType === "deposit" ? "📥" : flowType === "inter-exchange" ? "🔄" : "↔️";

  return (
    <div
      className="border rounded-xl p-3.5 transition-all"
      style={{
        background: isAboveThreshold ? `${color}08` : "hsl(var(--muted) / 0.08)",
        borderColor: isAboveThreshold ? `${color}40` : "hsl(var(--border))",
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black" style={{ color }}>{CHAIN_ICONS[alert.blockchain]} {alert.symbol}</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
            {flowIcon} {flowType}
          </span>
          {isAboveThreshold && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "hsl(0 84% 60% / 0.15)", color: "hsl(0 84% 60%)" }}>
              🔥 WHALE
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{timeAgo(alert.timestamp)}</span>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2.5 text-[11px]">
        <div className="truncate"><AddressLabel address={alert.from} /></div>
        <div className="text-muted-foreground font-bold text-sm">→</div>
        <div className="truncate text-right"><AddressLabel address={alert.to} /></div>
      </div>

      {/* Value */}
      <div className="flex justify-between items-baseline">
        <div className="font-black text-base" style={{ color: "hsl(var(--foreground))" }}>
          {fmtAmount(alert.amount)} <span className="text-xs font-bold" style={{ color }}>{alert.symbol}</span>
        </div>
        <div className="font-black text-sm" style={{ color: isAboveThreshold ? "hsl(0 84% 60%)" : "hsl(var(--muted-foreground))" }}>
          {fmtUsd(alert.amount_usd)}
        </div>
      </div>

      {/* Explorer */}
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] mt-1.5 block truncate" style={{ color: `${color}aa` }}>
          View on Explorer ↗
        </a>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
export default function WhalePage() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<FeedSource>("demo");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [minUsd, setMinUsd] = useState(0);
  const [alertThreshold, setAlertThreshold] = useState(10_000_000); // $10M default
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchWhales = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("whale-feed", { method: "POST", body: {} });
      if (error) throw error;
      const result = normalizeResponse(data);
      if (result.alerts.length === 0) throw new Error("Empty");

      // Threshold alerts
      if (notificationsOn) {
        for (const a of result.alerts) {
          if (!seenIdsRef.current.has(a.id) && a.amount_usd >= alertThreshold) {
            toast.warning(`🐋 ${fmtAmount(a.amount)} ${a.symbol} (${fmtUsd(a.amount_usd)})`, {
              description: `${truncAddr(a.from)} → ${truncAddr(a.to)}`,
              duration: 8000,
            });
            if ("Notification" in window && Notification.permission === "granted") {
              try { new Notification(`🐋 Whale Alert: ${fmtUsd(a.amount_usd)}`, { body: `${fmtAmount(a.amount)} ${a.symbol} moved`, tag: a.id }); } catch {}
            }
          }
        }
        result.alerts.forEach(a => seenIdsRef.current.add(a.id));
      }

      setAlerts(result.alerts);
      setSource(result.source);
      setLastRefresh(new Date());
    } catch {
      setAlerts(getMockAlerts());
      setSource("demo");
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [notificationsOn, alertThreshold]);

  useEffect(() => {
    fetchWhales();
    if (!autoRefresh) return;
    const timer = setInterval(fetchWhales, 45_000); // 45s
    return () => clearInterval(timer);
  }, [fetchWhales, autoRefresh]);

  const enableNotifications = useCallback(async () => {
    if ("Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
    setNotificationsOn(true);
    toast.success("Whale alerts enabled — you'll be notified for transactions above " + fmtUsd(alertThreshold));
  }, [alertThreshold]);

  // Derived
  const chains = useMemo(() => {
    const map = new Map<string, { symbol: string; count: number }>();
    for (const a of alerts) {
      const e = map.get(a.blockchain) || { symbol: a.symbol, count: 0 };
      e.count++;
      map.set(a.blockchain, e);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [alerts]);

  const filtered = useMemo(() => {
    let base = alerts;
    if (chainFilter !== "all") base = base.filter(a => a.blockchain === chainFilter);
    if (minUsd > 0) base = base.filter(a => a.amount_usd >= minUsd);
    return base;
  }, [alerts, chainFilter, minUsd]);

  const stats = useMemo(() => {
    const totalVol = alerts.reduce((s, a) => s + a.amount_usd, 0);
    const avgSize = alerts.length > 0 ? totalVol / alerts.length : 0;
    const largest = alerts.length > 0 ? Math.max(...alerts.map(a => a.amount_usd)) : 0;
    const uniqueChains = new Set(alerts.map(a => a.blockchain)).size;
    const exchangeTxs = alerts.filter(a => labelAddress(a.from).isExchange || labelAddress(a.to).isExchange).length;
    return { totalVol, avgSize, largest, uniqueChains, txCount: alerts.length, exchangeTxs };
  }, [alerts]);

  return (
    <div className="whale-page-root">
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2>🐋 Whale Intelligence</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusBadge source={source} />
            <button
              className="btn"
              onClick={fetchWhales}
              disabled={loading}
              style={{ fontSize: 11, padding: "5px 14px" }}
            >
              {loading ? "⏳ Scanning..." : "🔄 Refresh"}
            </button>
          </div>
        </div>

        <div className="panel-body">
          {/* Stats grid */}
          <div className="whale-stats-grid">
            <StatCard label="Total Volume" value={fmtUsd(stats.totalVol)} sub={`${stats.txCount} transactions`} color="hsl(var(--primary))" />
            <StatCard label="Largest Tx" value={fmtUsd(stats.largest)} />
            <StatCard label="Avg Size" value={fmtUsd(stats.avgSize)} />
            <StatCard label="Active Chains" value={String(stats.uniqueChains)} sub={chains.map(([, v]) => v.symbol).join(", ")} />
            <StatCard label="Exchange Flows" value={String(stats.exchangeTxs)} sub={`${stats.txCount > 0 ? Math.round(stats.exchangeTxs / stats.txCount * 100) : 0}% of total`} color="hsl(210 80% 55%)" />
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            {/* Chain filters */}
            <ChainFilterPill chain="all" symbol="All" active={chainFilter === "all"} onClick={() => setChainFilter("all")} count={alerts.length} />
            {chains.map(([chain, { symbol, count }]) => (
              <ChainFilterPill key={chain} chain={chain} symbol={symbol} active={chainFilter === chain} onClick={() => setChainFilter(chain)} count={count} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            {/* Min USD */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="text-[10px] font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>Min USD:</span>
              <select
                className="inp"
                value={minUsd}
                onChange={e => setMinUsd(Number(e.target.value))}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                <option value={0}>Any</option>
                <option value={100000}>$100K+</option>
                <option value={1000000}>$1M+</option>
                <option value={10000000}>$10M+</option>
                <option value={50000000}>$50M+</option>
                <option value={100000000}>$100M+</option>
              </select>
            </div>

            {/* Alert threshold */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="text-[10px] font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>Alert threshold:</span>
              <select
                className="inp"
                value={alertThreshold}
                onChange={e => setAlertThreshold(Number(e.target.value))}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                <option value={1000000}>$1M+</option>
                <option value={5000000}>$5M+</option>
                <option value={10000000}>$10M+</option>
                <option value={50000000}>$50M+</option>
                <option value={100000000}>$100M+</option>
              </select>
            </div>

            {/* Auto-refresh toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: "hsl(142, 71%, 45%)" }} />
              <span className="text-[10px] font-bold" style={{ color: "hsl(var(--muted-foreground))" }}>Auto-refresh (45s)</span>
            </label>

            {/* Notifications */}
            <button
              className="text-[10px] font-bold px-2.5 py-1 rounded-md border cursor-pointer"
              onClick={notificationsOn ? () => setNotificationsOn(false) : enableNotifications}
              style={{
                background: notificationsOn ? "hsl(142 71% 45% / 0.12)" : "transparent",
                borderColor: notificationsOn ? "hsl(142 71% 45% / 0.3)" : "hsl(var(--border))",
                color: notificationsOn ? "hsl(142 71% 35%)" : "hsl(var(--muted-foreground))",
              }}
            >
              {notificationsOn ? "🔔 Alerts On" : "🔕 Enable Alerts"}
            </button>
          </div>

          {/* Feed */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "hsl(var(--muted-foreground))" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🐋</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Scanning the deep...</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Monitoring mempool across multiple chains</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "hsl(var(--muted-foreground))" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No whale movements found</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Try lowering the minimum USD filter or wait for the next scan</div>
            </div>
          ) : (
            <div className="whale-feed-grid">
              {filtered.map(a => (
                <WhaleCard key={a.id} alert={a} threshold={alertThreshold} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
            <span>{filtered.length} of {alerts.length} transactions · {source === "live" ? "Live mempool data" : source === "cached" ? "Cached data" : "Demo mode"}</span>
            <span>{lastRefresh ? `Last update: ${lastRefresh.toLocaleTimeString()}` : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
