import React, { useState, useEffect, useCallback } from "react";
import { fmtQty } from "@/lib/cryptoState";
import { toast } from "sonner";

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
}

// ─── Push Notification Helpers ───────────────────────────────────────────────

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sendNotification(title: string, body: string, icon = "🐋") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: undefined, badge: undefined, tag: "whale-alert" });
  } catch {
    // Fallback: some browsers don't support Notification constructor in this context
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WhaleTracker() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
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
    async function fetchWhales() {
      try {
        const mockAlerts: WhaleAlert[] = [
          { id: "1", blockchain: "bitcoin", symbol: "BTC", amount: 1250, amount_usd: 84300000, from: "Unknown Wallet", to: "Binance", timestamp: Date.now() - 300000, transaction_type: "transfer" },
          { id: "2", blockchain: "ethereum", symbol: "ETH", amount: 15400, amount_usd: 54200000, from: "FTX Cold Wallet", to: "Unknown Wallet", timestamp: Date.now() - 1200000, transaction_type: "transfer" },
          { id: "3", blockchain: "solana", symbol: "SOL", amount: 450000, amount_usd: 75000000, from: "Unknown Wallet", to: "Kraken", timestamp: Date.now() - 2500000, transaction_type: "transfer" },
        ];

        // Send push notifications for new alerts
        if (notificationsEnabled) {
          for (const alert of mockAlerts) {
            if (!seenIds.has(alert.id)) {
              const usdStr = `$${(alert.amount_usd / 1_000_000).toFixed(1)}M`;
              const direction = alert.to.includes("Binance") || alert.to.includes("Kraken")
                ? "🚨 Exchange deposit (sell pressure)"
                : "🟢 Cold storage (accumulation)";
              sendNotification(
                `🐋 ${fmtQty(alert.amount)} ${alert.symbol} moved`,
                `${usdStr} — ${alert.from} → ${alert.to}\n${direction}`
              );
            }
          }
          setSeenIds(prev => {
            const next = new Set(prev);
            mockAlerts.forEach(a => next.add(a.id));
            return next;
          });
        }

        setAlerts(mockAlerts);
      } catch (err) {
        console.error("Whale Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchWhales();
    const timer = setInterval(fetchWhales, 60000);
    return () => clearInterval(timer);
  }, [notificationsEnabled, seenIds]);

  if (loading) return <div className="muted" style={{ textAlign: "center", padding: 20 }}>Scanning the deep... 🐋</div>;

  return (
    <div className="whale-tracker" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Notification toggle */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 12px", borderRadius: 8,
        background: notificationsEnabled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${notificationsEnabled ? "rgba(34,197,94,0.2)" : "var(--line)"}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>
          {notificationsEnabled ? "🔔 Push Notifications On" : "🔕 Push Notifications Off"}
        </div>
        <button
          className="btn tiny"
          onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : enableNotifications}
          style={{
            fontSize: 10, padding: "3px 10px",
            background: notificationsEnabled ? "var(--panel2)" : "var(--brand)",
            color: notificationsEnabled ? "var(--muted)" : "#fff",
            border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700,
          }}
        >
          {notificationsEnabled ? "Disable" : "Enable"}
        </button>
      </div>

      {alerts.map(alert => (
        <div key={alert.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="mono" style={{ fontWeight: 900, color: "var(--brand)", fontSize: 13 }}>{alert.symbol} 🐋</span>
            <span style={{ fontSize: 9, color: "var(--muted2)" }}>{new Date(alert.timestamp).toLocaleTimeString()}</span>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.from}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>→</div>
            <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{alert.to}</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: alert.to.includes("Binance") || alert.to.includes("Kraken") ? "var(--bad)" : "var(--good)" }}>
               {fmtQty(alert.amount)} {alert.symbol}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>${(alert.amount_usd / 1000000).toFixed(1)}M USD</div>
          </div>
          
          <div style={{ marginTop: 6, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted2)" }}>
            {alert.to.includes("Binance") || alert.to.includes("Kraken") ? "🚨 Potential Sell-off Pressure" : "🟢 Cold Storage Accumulation"}
          </div>
        </div>
      ))}
      <div style={{ textAlign: "center", marginTop: 4, fontSize: 10, color: "var(--muted2)" }}>
        Real-time whale flows can indicate major market shifts.
      </div>
    </div>
  );
}
