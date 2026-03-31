import React, { useState, useEffect, useCallback } from "react";
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

// ─── Push Notification Helpers ───────────────────────────────────────────────

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
    // Fallback: some browsers don't support Notification constructor
  }
}

// ─── Fallback mock data ─────────────────────────────────────────────────────

function getMockAlerts(): WhaleAlert[] {
  return [
    { id: "mock-1", blockchain: "bitcoin", symbol: "BTC", amount: 1250, amount_usd: 84300000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 300000, transaction_type: "transfer" },
    { id: "mock-2", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
    { id: "mock-3", blockchain: "bitcoin", symbol: "BTC", amount: 800, amount_usd: 53900000, from: "Unknown", to: "Unknown", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
  ];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WhaleTracker() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());

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

    async function fetchWhales() {
      try {
        const { data, error } = await supabase.functions.invoke("whale-feed");

        if (error || !data?.success || !data?.alerts?.length) {
          // Fallback to mock data
          if (!cancelled) {
            setAlerts(getMockAlerts());
            setIsLive(false);
          }
          return;
        }

        const liveAlerts: WhaleAlert[] = data.alerts;

        // Send push notifications for new alerts
        if (notificationsEnabled) {
          for (const alert of liveAlerts) {
            if (!seenIds.has(alert.id)) {
              const usdStr = `$${(alert.amount_usd / 1_000_000).toFixed(1)}M`;
              sendNotification(
                `🐋 ${fmtQty(alert.amount)} ${alert.symbol} moved`,
                `${usdStr} — ${alert.from} → ${alert.to}`
              );
            }
          }
          setSeenIds(prev => {
            const next = new Set(prev);
            liveAlerts.forEach(a => next.add(a.id));
            return next;
          });
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
    }

    fetchWhales();
    const timer = setInterval(fetchWhales, 120_000); // 2 min to respect free rate limits
    return () => { cancelled = true; clearInterval(timer); };
  }, [notificationsEnabled, seenIds]);

  if (loading) return <div className="text-muted-foreground text-center p-5">Scanning the deep... 🐋</div>;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Status + notification toggle */}
      <div className="flex justify-between items-center px-3 py-2 rounded-lg border"
        style={{
          background: notificationsEnabled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
          borderColor: notificationsEnabled ? "rgba(34,197,94,0.2)" : "hsl(var(--border))",
        }}>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: isLive ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
              color: isLive ? "rgb(34,197,94)" : "rgb(234,179,8)",
            }}>
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

      {alerts.map(alert => (
        <div key={alert.id} className="border rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", borderColor: "hsl(var(--border))" }}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-mono font-black text-primary text-[13px]">{alert.symbol} 🐋</span>
            <span className="text-[9px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
            <div className="text-[11px] font-bold truncate text-foreground">
              {alert.from.length > 12 ? alert.from.slice(0, 6) + "…" + alert.from.slice(-4) : alert.from}
            </div>
            <div className="text-[12px] text-muted-foreground">→</div>
            <div className="text-[11px] font-bold truncate text-right text-foreground">
              {alert.to.length > 12 ? alert.to.slice(0, 6) + "…" + alert.to.slice(-4) : alert.to}
            </div>
          </div>

          <div className="flex justify-between items-baseline">
            <div className="font-extrabold text-[15px] text-foreground">
              {fmtQty(alert.amount)} {alert.symbol}
            </div>
            <div className="text-[10px] text-muted-foreground font-bold">
              ${(alert.amount_usd / 1_000_000).toFixed(1)}M USD
            </div>
          </div>

          {alert.tx_hash && (
            <a
              href={alert.blockchain === "bitcoin"
                ? `https://blockchair.com/bitcoin/transaction/${alert.tx_hash}`
                : `https://blockchair.com/ethereum/transaction/${alert.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[8px] text-primary/60 hover:text-primary mt-1 block truncate"
            >
              View on Blockchair ↗
            </a>
          )}
        </div>
      ))}

      <div className="text-center mt-1 text-[10px] text-muted-foreground">
        {isLive ? "Live data via Blockchair (free tier)" : "Demo data — deploy edge function for live feed"}
      </div>
    </div>
  );
}
