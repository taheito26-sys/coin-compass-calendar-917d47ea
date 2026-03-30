import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ExchangeConn {
  id: string;
  exchange: string;
  label: string | null;
  status: string;
  last_sync: string | null;
  sync_count: number;
  created_at?: string;
}

function statusColor(status: string): string {
  if (status === "connected") return "var(--good)";
  if (status === "error") return "var(--bad)";
  return "var(--warn)";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const EXCHANGE_ICONS: Record<string, string> = {
  binance: "🟡", bybit: "🟠", okx: "⚪", gate: "🔵",
  coinbase: "🔵", kraken: "🟣", mexc: "🟢", kucoin: "🟢",
};

export default function ExchangeHealthDashboard() {
  const [connections, setConnections] = useState<ExchangeConn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("exchange_connections").select("*").order("exchange");
      setConnections(data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="panel"><div className="panel-body muted" style={{ padding: 20 }}>Loading connections...</div></div>;

  if (connections.length === 0) {
    return (
      <div className="panel">
        <div className="panel-head">Exchange Health</div>
        <div className="panel-body" style={{ textAlign: "center", padding: 32 }}>
          <div className="muted" style={{ fontSize: 14 }}>No exchanges connected yet.</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Go to Ledger → Connect tab to add an exchange.</div>
        </div>
      </div>
    );
  }

  const healthy = connections.filter(c => c.status === "connected").length;
  const errored = connections.filter(c => c.status === "error").length;

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Exchange Health</span>
        <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
          <span className="good">{healthy} healthy</span>
          {errored > 0 && <span className="bad">{errored} error</span>}
        </div>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {connections.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0 }}>
              {EXCHANGE_ICONS[c.exchange] || "🔗"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{c.exchange}</div>
              <div className="muted" style={{ fontSize: 11 }}>{c.label || "No label"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(c.status), display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(c.status), textTransform: "capitalize" }}>{c.status}</span>
              </div>
              <div className="muted" style={{ fontSize: 10 }}>Last sync: {timeAgo(c.last_sync)}</div>
              <div className="muted" style={{ fontSize: 10 }}>{c.sync_count} syncs total</div>
            </div>
          </div>
        ))}
        <div style={{ padding: "10px 16px" }}>
          <button className="btn secondary" style={{ fontSize: 11 }} onClick={load}>Refresh</button>
        </div>
      </div>
    </div>
  );
}
