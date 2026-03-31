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
  bitcoin: "hsl(32 92% 50%)",
  ethereum: "hsl(226 74% 63%)",
  litecoin: "hsl(0 2% 75%)",
  dogecoin: "hsl(47 56% 48%)",
  "bitcoin-cash": "hsl(121 53% 54%)",
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
  } catch {
    // Ignore unsupported Notification constructor contexts
  }
}

function getMockAlerts(): WhaleAlert[] {
  return [
    { id: "mock-1", blockchain: "bitcoin", symbol: "BTC", amount: 1250, amount_usd: 84300000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 300000, transaction_type: "transfer" },
    { id: "mock-2", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
    { id: "mock-3", blockchain: "bitcoin", symbol: "BTC", amount: 800, amount_usd: 53900000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
  ];
}

function normalizeAlerts(data: unknown): WhaleAlert[] {
  const payload = data && typeof data === "object" && "data" in data
    ? (data as { data?: unknown }).data ?? data
    : data;

  if (!payload || typeof payload !== "object") return [];

  const typedPayload = payload as {
    success?: boolean;
    alerts?: WhaleAlert[];
    transactions?: WhaleAlert[];
  };

  if (typedPayload.success === false) return [];
  if (Array.isArray(typedPayload.alerts)) return typedPayload.alerts;
  if (Array.isArray(typedPayload.transactions)) return typedPayload.transactions;
  return [];
}

export function WhaleTracker() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
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

        if (error) {
          throw error;
        }

        const liveAlerts = normalizeAlerts(data);
        if (liveAlerts.length === 0) {
          throw new Error("No whale alerts returned from live feed");
        }

        if (notificationsEnabled) {
          for (const alert of liveAlerts) {
            if (!seenIdsRef.current.has(alert.id)) {
              const usdStr = `$${(alert.amount_usd / 1_000_000).toFixed(1)}M`;
              sendNotification(
                `🐋 ${fmtQty(alert.amount)} ${alert.symbol} moved`,
                `${usdStr} — ${alert.from} → ${alert.to}`
              );
            }
          }

          liveAlerts.forEach((alert) => seenIdsRef.current.add(alert.id));
        }

        if (!cancelled) {
          setAlerts(liveAlerts);
          setIsLive(true);
        }
      } catch (err) {
        console.error("Whale Fetch Error:", err);
        if (!cancelled) {
          setAlerts(getMockAlerts());
          setIsLive(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWhales();
    const timer = setInterval(fetchWhales, 120_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [notificationsEnabled]);

  if (loading) {
    return <div className="text-muted-foreground text-center p-5">Scanning the deep... 🐋</div>;
  }

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
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: isLive ? "hsl(142 71% 45% / 0.15)" : "hsl(43 96% 56% / 0.15)",
              color: isLive ? "hsl(142 71% 35%)" : "hsl(38 92% 40%)",
            }}
          >
            {isLive ? "● LIVE" : "● DEMO"}
          </span>
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

      {alerts.map((alert) => {
        const color = CHAIN_COLORS[alert.blockchain] ?? "hsl(var(--primary))";

        return (
          <div
            key={alert.id}
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
              <div className="text-[11px] font-bold truncate text-foreground">
                {alert.from.length > 14 ? `${alert.from.slice(0, 6)}…${alert.from.slice(-4)}` : alert.from}
              </div>
              <div className="text-[12px] text-muted-foreground">→</div>
              <div className="text-[11px] font-bold truncate text-right text-foreground">
                {alert.to.length > 14 ? `${alert.to.slice(0, 6)}…${alert.to.slice(-4)}` : alert.to}
              </div>
            </div>

            <div className="flex justify-between items-baseline gap-3">
              <div className="font-extrabold text-[15px] text-foreground">
                {fmtQty(alert.amount)} {alert.symbol}
              </div>
              <div className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                ${alert.amount_usd >= 1e9
                  ? `${(alert.amount_usd / 1e9).toFixed(2)}B`
                  : `${(alert.amount_usd / 1e6).toFixed(1)}M`} USD
              </div>
            </div>

            {alert.tx_hash && (
              <a
                href={`https://blockchair.com/${alert.blockchain}/transaction/${alert.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[8px] text-primary/70 hover:text-primary mt-1 block truncate"
              >
                View on Blockchair ↗
              </a>
            )}
          </div>
        );
      })}

      <div className="text-center mt-1 text-[10px] text-muted-foreground">
        {isLive
          ? "Live data from BTC · ETH · LTC · DOGE · BCH via Blockchair"
          : "Demo data — live feed unavailable"}
      </div>
    </div>
  );
}
