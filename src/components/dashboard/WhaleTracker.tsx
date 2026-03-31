import React, { useState, useEffect, useCallback, useRef } from "react";
import { fmtQty } from "@/lib/cryptoState";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const CHAIN_COLORS: Record<string, string> = {
  bitcoin: "hsl(var(--chart-3))",
  ethereum: "hsl(var(--chart-1))",
  litecoin: "hsl(var(--muted-foreground))",
  dogecoin: "hsl(var(--chart-4))",
  "bitcoin-cash": "hsl(var(--chart-2))",
  solana: "hsl(var(--chart-5))",
};

const EXPLORER_BASE: Record<string, string> = {
  bitcoin: "https://blockchair.com/bitcoin/transaction/",
  ethereum: "https://etherscan.io/tx/",
  litecoin: "https://blockchair.com/litecoin/transaction/",
  dogecoin: "https://blockchair.com/dogecoin/transaction/",
  "bitcoin-cash": "https://blockchair.com/bitcoin-cash/transaction/",
  solana: "https://solscan.io/tx/",
};

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sendNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "whale-alert" });
  } catch { /* unsupported context */ }
}

type FeedSource = "live" | "cached" | "demo";

function normalizeResponse(data: unknown): { alerts: WhaleAlert[]; source: FeedSource } {
  const payload = data && typeof data === "object" && "data" in data
    ? (data as { data?: unknown }).data ?? data
    : data;

  if (!payload || typeof payload !== "object") return { alerts: [], source: "demo" };

  const p = payload as { success?: boolean; source?: string; alerts?: WhaleAlert[] };
  if (p.success === false) return { alerts: [], source: "demo" };

  const alerts = Array.isArray(p.alerts) ? p.alerts : [];
  const source: FeedSource = p.source === "live" ? "live" : p.source === "cached" ? "cached" : alerts.length > 0 ? "live" : "demo";
  return { alerts, source };
}

function getMockAlerts(): WhaleAlert[] {
  return [
    { id: "mock-1", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "0x1a2b..3c4d", to: "0x5e6f..7a8b", timestamp: Date.now() - 300000, transaction_type: "transfer" },
    { id: "mock-2", blockchain: "bitcoin", symbol: "BTC", amount: 800, amount_usd: 53900000, from: "bc1q..xz9m", to: "bc1q..4f7k", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
    { id: "mock-3", blockchain: "dogecoin", symbol: "DOGE", amount: 250000000, amount_usd: 42500000, from: "D7vK..mN3p", to: "DQkw..eR5t", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
  ];
}

function StatusBadge({ source }: { source: FeedSource }) {
  const isLive = source === "live";
  const isCached = source === "cached";
  const label = isLive ? "● LIVE" : isCached ? "● CACHED" : "● DEMO";

  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        background: isLive
          ? "hsl(142 71% 45% / 0.15)"
          : isCached
          ? "hsl(210 80% 55% / 0.15)"
          : "hsl(43 96% 56% / 0.15)",
        color: isLive
          ? "hsl(142 71% 35%)"
          : isCached
          ? "hsl(210 80% 45%)"
          : "hsl(38 92% 40%)",
      }}
    >
      {label}
    </span>
  );
}

function AlertCard({ alert }: { alert: WhaleAlert }) {
  const color = CHAIN_COLORS[alert.blockchain] ?? "hsl(var(--primary))";
  const explorerUrl = alert.tx_hash
    ? `${EXPLORER_BASE[alert.blockchain] ?? "https://blockchair.com/"}${alert.tx_hash}`
    : null;

  const truncAddr = (s: string) =>
    s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;

  return (
    <div
      className="border rounded-xl p-3"
      style={{ background: "hsl(var(--muted) / 0.12)", borderColor: "hsl(var(--border))" }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-mono font-black text-[13px] flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
          <span style={{ color }}>{alert.symbol}</span>
          <span>🐋</span>
        </span>
        <span className="text-[9px] text-muted-foreground">
          {new Date(alert.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
        <div className="text-[11px] font-bold truncate text-foreground">{truncAddr(alert.from)}</div>
        <div className="text-[12px] text-muted-foreground">→</div>
        <div className="text-[11px] font-bold truncate text-right text-foreground">{truncAddr(alert.to)}</div>
      </div>

      <div className="flex justify-between items-baseline gap-3">
        <div className="font-extrabold text-[15px] text-foreground">
          {fmtQty(alert.amount)} {alert.symbol}
        </div>
        <div className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
          ${alert.amount_usd >= 1e9
            ? `${(alert.amount_usd / 1e9).toFixed(2)}B`
            : alert.amount_usd >= 1e6
            ? `${(alert.amount_usd / 1e6).toFixed(1)}M`
            : `${(alert.amount_usd / 1e3).toFixed(0)}K`} USD
        </div>
      </div>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] text-primary/70 hover:text-primary mt-1 block truncate"
        >
          View on Explorer ↗
        </a>
      )}
    </div>
  );
}

export function WhaleTracker() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<FeedSource>("demo");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );
  const seenIdsRef = useRef<Set<string>>(new Set());

  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (granted) {
      toast.success("Push notifications enabled for whale alerts");
      sendNotification("Whale Alerts Active", "You'll be notified when large transfers are detected.");
    } else {
      toast.error("Notification permission denied. Check browser settings.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWhales = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("whale-feed", {
          method: "POST",
          body: {},
        });

        if (error) throw error;

        const result = normalizeResponse(data);

        if (result.alerts.length === 0) throw new Error("Empty response");

        if (notificationsEnabled) {
          for (const alert of result.alerts) {
            if (!seenIdsRef.current.has(alert.id)) {
              const usdStr = alert.amount_usd >= 1e6
                ? `$${(alert.amount_usd / 1_000_000).toFixed(1)}M`
                : `$${(alert.amount_usd / 1_000).toFixed(0)}K`;
              sendNotification(
                `🐋 ${fmtQty(alert.amount)} ${alert.symbol} moved`,
                `${usdStr} — ${alert.from} → ${alert.to}`
              );
            }
          }
          result.alerts.forEach((a) => seenIdsRef.current.add(a.id));
        }

        if (!cancelled) {
          setAlerts(result.alerts);
          setSource(result.source);
        }
      } catch (err) {
        console.error("Whale Fetch Error:", err);
        if (!cancelled) {
          setAlerts(getMockAlerts());
          setSource("demo");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWhales();
    const timer = setInterval(fetchWhales, 120_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [notificationsEnabled]);

  if (loading) {
    return <div className="text-muted-foreground text-center p-5">Scanning the deep... 🐋</div>;
  }

  const chainList = [...new Set(alerts.map((a) => a.symbol))].join(" · ");

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex justify-between items-center px-3 py-2 rounded-lg border"
        style={{
          background: notificationsEnabled ? "hsl(142 71% 45% / 0.08)" : "hsl(var(--muted) / 0.18)",
          borderColor: notificationsEnabled ? "hsl(142 71% 45% / 0.2)" : "hsl(var(--border))",
        }}
      >
        <div className="flex items-center gap-2">
          <StatusBadge source={source} />
          <span className="text-[11px] font-bold text-foreground">
            {notificationsEnabled ? "🔔 Alerts On" : "🔕 Alerts Off"}
          </span>
        </div>
        <button
          className="text-[10px] px-2.5 py-1 rounded-md font-bold border-none cursor-pointer"
          onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : enableNotifications}
          style={{
            background: notificationsEnabled ? "hsl(var(--muted))" : "hsl(var(--primary))",
            color: notificationsEnabled ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
          }}
        >
          {notificationsEnabled ? "Disable" : "Enable"}
        </button>
      </div>

      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}

      <div className="text-center mt-1 text-[10px] text-muted-foreground">
        {source === "live"
          ? `Live multi-chain data · ${chainList}`
          : source === "cached"
          ? `Cached data · ${chainList} (upstream temporarily unavailable)`
          : "Demo data — live feed unavailable"}
      </div>
    </div>
  );
}
