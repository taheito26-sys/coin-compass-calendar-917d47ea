import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────
interface ListingEvent {
  id: string;
  token_symbol: string;
  token_name: string | null;
  exchange: string;
  event_type: string;
  status: string;
  confidence_score: number;
  lead_time_minutes: number | null;
  source_url: string | null;
  announcement_time: string | null;
  detected_time: string;
}

type Tab = "listings" | "airdrops" | "new_assets" | "delistings";

const EVENT_TYPE_COLORS: Record<string, string> = {
  listing: "hsl(142 71% 45%)",
  futures_listing: "hsl(210 80% 55%)",
  perpetual_listing: "hsl(250 70% 60%)",
  deposit_open: "hsl(43 96% 56%)",
  trading_live: "hsl(142 71% 45%)",
  delisting: "hsl(0 84% 60%)",
  airdrop: "hsl(280 70% 60%)",
  new_asset: "hsl(190 80% 50%)",
};

const EXCHANGE_COLORS: Record<string, string> = {
  binance: "#F0B90B",
  coinbase: "#0052FF",
  kucoin: "#24AE8F",
  okx: "#000",
  bybit: "#F7A600",
  coingecko: "#8DC63F",
};

// ── Confidence Badge ────────────────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 85 ? "hsl(142 71% 45%)" : score >= 60 ? "hsl(43 96% 56%)" : "hsl(0 84% 60%)";
  return (
    <span
      className="text-[10px] font-black px-1.5 py-0.5 rounded"
      style={{ background: `${color}22`, color }}
    >
      {score}%
    </span>
  );
}

// ── Status Badge ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: "hsl(142 71% 45%)",
    announced: "hsl(210 80% 55%)",
    live: "hsl(142 71% 45%)",
    rumor: "hsl(43 96% 56%)",
    cancelled: "hsl(0 84% 60%)",
    closed: "hsl(var(--muted-foreground))",
  };
  const c = colors[status] || "hsl(var(--muted-foreground))";
  return (
    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${c}18`, color: c }}>
      {status}
    </span>
  );
}

// ── Time formatter ──────────────────────────────────────────────────
function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Main Component ──────────────────────────────────────────────────
export default function OpportunitiesPage() {
  const [tab, setTab] = useState<Tab>("listings");
  const [events, setEvents] = useState<ListingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  // Filters
  const [exchangeFilter, setExchangeFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState<number>(0);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("listing_events")
      .select("id, token_symbol, token_name, exchange, event_type, status, confidence_score, lead_time_minutes, source_url, announcement_time, detected_time")
      .order("detected_time", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to fetch events:", error);
      toast.error("Failed to load opportunity data");
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  };

  const runIngest = async () => {
    setIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("opportunity-ingest", { method: "POST", body: {} });
      if (error) throw error;
      toast.success(`Ingested ${data?.inserted || 0} new events from ${Object.keys(data?.sources || {}).length} sources`);
      fetchEvents();
    } catch (err) {
      console.error("Ingest error:", err);
      toast.error("Failed to run ingest");
    } finally {
      setIngesting(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  // ── Filtered data per tab ───────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let base = events;

    // Tab filter
    if (tab === "listings") base = base.filter(e => ["listing", "futures_listing", "perpetual_listing", "deposit_open", "trading_live"].includes(e.event_type));
    else if (tab === "airdrops") base = base.filter(e => ["airdrop", "snapshot", "distribution"].includes(e.event_type));
    else if (tab === "new_assets") base = base.filter(e => e.event_type === "new_asset");
    else if (tab === "delistings") base = base.filter(e => ["delisting", "suspension"].includes(e.event_type));

    // Additional filters
    if (exchangeFilter !== "all") base = base.filter(e => e.exchange === exchangeFilter);
    if (eventTypeFilter !== "all") base = base.filter(e => e.event_type === eventTypeFilter);
    if (minConfidence > 0) base = base.filter(e => e.confidence_score >= minConfidence);

    return base;
  }, [events, tab, exchangeFilter, eventTypeFilter, minConfidence]);

  const exchanges = useMemo(() => [...new Set(events.map(e => e.exchange))].sort(), [events]);
  const eventTypes = useMemo(() => [...new Set(events.map(e => e.event_type))].sort(), [events]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "listings", label: "Listings", count: events.filter(e => ["listing", "futures_listing", "perpetual_listing", "deposit_open", "trading_live"].includes(e.event_type)).length },
    { key: "airdrops", label: "Airdrops", count: events.filter(e => ["airdrop", "snapshot", "distribution"].includes(e.event_type)).length },
    { key: "new_assets", label: "New Assets", count: events.filter(e => e.event_type === "new_asset").length },
    { key: "delistings", label: "Delistings", count: events.filter(e => ["delisting", "suspension"].includes(e.event_type)).length },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>🔍 Opportunity Intelligence</h2>
          <button
            className="btn"
            onClick={runIngest}
            disabled={ingesting}
            style={{ fontSize: 11, padding: "5px 14px" }}
          >
            {ingesting ? "⏳ Scanning..." : "🔄 Scan Now"}
          </button>
        </div>
        <div className="panel-body">
          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={tab === t.key ? "btn" : "btn secondary"}
                style={{ fontSize: 11, padding: "5px 12px", flex: 1 }}
              >
                {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>({t.count})</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <select
              className="inp"
              value={exchangeFilter}
              onChange={e => setExchangeFilter(e.target.value)}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              <option value="all">All Exchanges</option>
              {exchanges.map(ex => <option key={ex} value={ex}>{ex.charAt(0).toUpperCase() + ex.slice(1)}</option>)}
            </select>
            <select
              className="inp"
              value={eventTypeFilter}
              onChange={e => setEventTypeFilter(e.target.value)}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              <option value="all">All Events</option>
              {eventTypes.map(et => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Min Confidence:</span>
              <input
                type="number"
                className="inp"
                value={minConfidence || ""}
                onChange={e => setMinConfidence(parseInt(e.target.value) || 0)}
                placeholder="0"
                min={0}
                max={100}
                style={{ width: 50, fontSize: 11, padding: "4px 6px" }}
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading intelligence data...</div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No events found</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Click "Scan Now" to fetch the latest data from exchanges</div>
            </div>
          ) : (
            <div className="tableWrap">
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                    <th style={{ padding: "6px 0" }}>Token</th>
                    <th>Exchange</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Lead Time</th>
                    <th>Detected</th>
                    <th style={{ textAlign: "right" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map(ev => (
                    <tr key={ev.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px 0" }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{ev.token_symbol}</div>
                        {ev.token_name && (
                          <div style={{ fontSize: 9, color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ev.token_name}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={{
                            background: `${EXCHANGE_COLORS[ev.exchange] || "#666"}22`,
                            color: EXCHANGE_COLORS[ev.exchange] || "#999",
                          }}
                        >
                          {ev.exchange}
                        </span>
                      </td>
                      <td>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: `${EVENT_TYPE_COLORS[ev.event_type] || "#666"}18`,
                            color: EVENT_TYPE_COLORS[ev.event_type] || "#999",
                          }}
                        >
                          {ev.event_type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td><StatusBadge status={ev.status} /></td>
                      <td><ConfidenceBadge score={ev.confidence_score} /></td>
                      <td style={{ fontSize: 11 }}>
                        {ev.lead_time_minutes != null ? (
                          <span style={{ color: ev.lead_time_minutes < 60 ? "hsl(142 71% 45%)" : "var(--text)" }}>
                            {ev.lead_time_minutes < 60 ? `${ev.lead_time_minutes}m` : `${Math.round(ev.lead_time_minutes / 60)}h`}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ fontSize: 10, color: "var(--muted)" }}>{timeAgo(ev.detected_time)}</td>
                      <td style={{ textAlign: "right" }}>
                        {ev.source_url ? (
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary/70 hover:text-primary"
                          >
                            View ↗
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Stats footer */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
            <span>{filteredEvents.length} events displayed</span>
            <span>{events.length} total events tracked</span>
          </div>
        </div>
      </div>
    </div>
  );
}
