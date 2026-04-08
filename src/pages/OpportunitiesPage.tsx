import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

interface AirdropProject {
  id: string;
  project_name: string;
  token_symbol: string | null;
  chain: string | null;
  official_url: string | null;
  snapshot_date: string | null;
  distribution_date: string | null;
  eligibility_requirements: string | null;
  confidence_score: number;
  tasks: AirdropTask[];
}

interface AirdropTask {
  id: string;
  project_id: string;
  task_type: string;
  description: string;
  deadline: string | null;
  required: boolean;
  completed?: boolean;
}

type Tab = "listings" | "airdrops" | "new_assets" | "delistings" | "sentiment";

// ── Sentiment types ─────────────────────────────────────────────────
interface SentimentNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceIcon: string;
  sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;
  timestamp: number;
  category: string;
  coins: string[];
  engagement: number;
}

interface SentimentTrending {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  marketCapRank: number | null;
  priceChangePercent24h: number | null;
  score: number;
}

interface CoinSentiment {
  symbol: string;
  name: string;
  mentions: number;
  avgSentiment: number;
  sentiment: "bullish" | "bearish" | "neutral";
  price: number;
  change24h: number | null;
  marketCapRank: number;
  image: string;
}

interface SentimentData {
  news: SentimentNewsItem[];
  trending: SentimentTrending[];
  fearGreed: { value: number; label: string; history: { value: number; ts: number }[] };
  marketDominance: { btc: number; eth: number; others: number };
  communityBuzz: { topic: string; mentions: number; sentiment: string }[];
  coinSentiments: CoinSentiment[];
  lastUpdated: number;
}

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
  okx: "#888",
  bybit: "#F7A600",
  coingecko: "#8DC63F",
};

// ── Sub-components ──────────────────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 85 ? "hsl(142 71% 45%)" : score >= 60 ? "hsl(43 96% 56%)" : "hsl(0 84% 60%)";
  return (
    <span className="text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: `${color}22`, color }}>
      {score}%
    </span>
  );
}

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

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = pct === 100 ? "hsl(142 71% 45%)" : pct >= 50 ? "hsl(43 96% 56%)" : "hsl(210 80% 55%)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return formatDate(ts);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Airdrop Card ────────────────────────────────────────────────────
function AirdropCard({ project, onToggleTask }: { project: AirdropProject; onToggleTask: (taskId: string, completed: boolean) => void }) {
  const completedCount = project.tasks.filter(t => t.completed).length;
  const totalCount = project.tasks.length;
  const requirements = project.eligibility_requirements?.split("\n").filter(Boolean) || [];

  return (
    <div
      className="border rounded-xl p-4"
      style={{ background: "hsl(var(--muted) / 0.08)", borderColor: "hsl(var(--border))" }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
            🪂 {project.project_name}
            {project.token_symbol && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "hsl(280 70% 60% / 0.15)", color: "hsl(280 70% 60%)" }}>
                ${project.token_symbol}
              </span>
            )}
          </div>
          {project.chain && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Chain: {project.chain}</div>}
        </div>
        <ConfidenceBadge score={project.confidence_score} />
      </div>

      {/* Dates */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Snapshot</div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>{formatDate(project.snapshot_date)}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 8px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Distribution</div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>{formatDate(project.distribution_date)}</div>
        </div>
      </div>

      {/* Eligibility Requirements */}
      {requirements.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase" }}>Eligibility</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.6 }}>
            {requirements.map((req, i) => <li key={i} style={{ color: "var(--text)" }}>{req}</li>)}
          </ul>
        </div>
      )}

      {/* Progress */}
      {totalCount > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Task Progress</span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{completedCount}/{totalCount}</span>
          </div>
          <ProgressBar completed={completedCount} total={totalCount} />
        </div>
      )}

      {/* Tasks */}
      {project.tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {project.tasks.map(task => (
            <label
              key={task.id}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px",
                borderRadius: 8, background: task.completed ? "hsl(142 71% 45% / 0.06)" : "rgba(255,255,255,0.02)",
                cursor: "pointer", transition: "background 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={task.completed || false}
                onChange={() => onToggleTask(task.id, !task.completed)}
                style={{ marginTop: 2, accentColor: "hsl(142 71% 45%)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  textDecoration: task.completed ? "line-through" : "none",
                  opacity: task.completed ? 0.6 : 1,
                }}>
                  {task.description}
                  {task.required && <span style={{ color: "hsl(0 84% 60%)", marginLeft: 4, fontSize: 9 }}>*required</span>}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", display: "flex", gap: 8 }}>
                  <span>{task.task_type}</span>
                  {task.deadline && <span>Due: {formatDate(task.deadline)}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Link */}
      {project.official_url && (
        <a
          href={project.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary/70 hover:text-primary"
          style={{ display: "block", marginTop: 8 }}
        >
          Official Page ↗
        </a>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export default function OpportunitiesPage() {
  const [tab, setTab] = useState<Tab>("listings");
  const [events, setEvents] = useState<ListingEvent[]>([]);
  const [airdrops, setAirdrops] = useState<AirdropProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const alertedIdsRef = useRef<Set<string>>(new Set());

  // Sentiment state
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [sentimentSourceFilter, setSentimentSourceFilter] = useState<string>("all");
  const [sentimentTypeFilter, setSentimentTypeFilter] = useState<string>("all");

  // Filters (shared)
  const [exchangeFilter, setExchangeFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [minConfidence, setMinConfidence] = useState<number>(0);

  // Airdrop-specific filters
  const [airdropChainFilter, setAirdropChainFilter] = useState<string>("all");
  const [airdropMinConfidence, setAirdropMinConfidence] = useState<number>(0);
  const [airdropTaskTypeFilter, setAirdropTaskTypeFilter] = useState<string>("all");
  const [airdropSearch, setAirdropSearch] = useState<string>("");

  // ── Alert engine ────────────────────────────────────────────────
  const checkAlerts = useCallback((evts: ListingEvent[]) => {
    for (const ev of evts) {
      if (alertedIdsRef.current.has(ev.id)) continue;

      // High-confidence listing alert
      if (
        ["listing", "futures_listing", "perpetual_listing"].includes(ev.event_type) &&
        ev.status === "confirmed" &&
        ev.confidence_score >= 85
      ) {
        toast.success(`🚀 High-confidence listing: ${ev.token_symbol} on ${ev.exchange.toUpperCase()}`, {
          description: `Confidence: ${ev.confidence_score}% — ${ev.event_type.replace(/_/g, " ")}`,
          duration: 8000,
        });
        alertedIdsRef.current.add(ev.id);
      }

      // Delisting alert
      if (ev.event_type === "delisting") {
        toast.error(`⚠️ Delisting: ${ev.token_symbol} from ${ev.exchange.toUpperCase()}`, {
          description: `Status: ${ev.status} — Check your positions`,
          duration: 10000,
        });
        alertedIdsRef.current.add(ev.id);
      }
    }
  }, []);

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
      const evts = data || [];
      setEvents(evts);
      checkAlerts(evts);
    }
    setLoading(false);
  };

  const fetchAirdrops = async () => {
    const { data: projects } = await supabase
      .from("airdrop_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (!projects || projects.length === 0) {
      setAirdrops([]);
      return;
    }

    const projectIds = projects.map(p => p.id);
    const { data: tasks } = await supabase
      .from("airdrop_tasks")
      .select("*")
      .in("project_id", projectIds);

    // Get user progress
    const { data: progress } = await supabase
      .from("user_airdrop_progress")
      .select("task_id, completed");

    const progressMap = new Map<string, boolean>();
    for (const p of progress || []) {
      progressMap.set(p.task_id, p.completed);
    }

    const enriched: AirdropProject[] = projects.map(proj => ({
      ...proj,
      tasks: (tasks || [])
        .filter(t => t.project_id === proj.id)
        .map(t => ({ ...t, completed: progressMap.get(t.id) || false })),
    }));

    setAirdrops(enriched);
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    // Optimistic update
    setAirdrops(prev =>
      prev.map(p => ({
        ...p,
        tasks: p.tasks.map(t => t.id === taskId ? { ...t, completed } : t),
      }))
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sign in to track progress"); return; }

    const { error } = await supabase
      .from("user_airdrop_progress")
      .upsert(
        { user_id: user.id, task_id: taskId, completed, completed_at: completed ? new Date().toISOString() : null },
        { onConflict: "user_id,task_id" }
      );

    if (error) {
      console.error("Failed to update progress:", error);
      toast.error("Failed to save progress");
      // Revert
      setAirdrops(prev =>
        prev.map(p => ({
          ...p,
          tasks: p.tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t),
        }))
      );
    }
  };

  const runIngest = async () => {
    setIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("opportunity-ingest", { method: "POST", body: {} });
      if (error) throw error;
      toast.success(`Ingested ${data?.inserted || 0} new events from ${Object.keys(data?.sources || {}).length} sources`);
      fetchEvents();
      fetchAirdrops();
    } catch (err) {
      console.error("Ingest error:", err);
      toast.error("Failed to run ingest");
    } finally {
      setIngesting(false);
    }
  };

  // Fetch sentiment data — reads from DB cache (written by pg_cron)
  const fetchSentiment = useCallback(async (forceRefresh = false) => {
    setSentimentLoading(prev => !sentimentData ? true : prev);
    try {
      if (forceRefresh) {
        // Trigger a live refresh via edge function (POST)
        const { data, error } = await supabase.functions.invoke("sentiment-feed", { method: "POST", body: {} });
        if (!error && data) {
          setSentimentData(data);
          setSentimentLoading(false);
          return;
        }
      }
      // Read cached data from DB via edge function (GET = cached mode)
      const { data, error } = await supabase.functions.invoke("sentiment-feed", { method: "POST", body: { cached: true } });
      if (!error && data) {
        setSentimentData(data);
      } else {
        // Fallback: trigger live fetch
        const { data: live } = await supabase.functions.invoke("sentiment-feed", { method: "POST", body: {} });
        if (live) setSentimentData(live);
      }
    } catch (err) {
      console.error("Sentiment fetch error:", err);
    } finally {
      setSentimentLoading(false);
    }
  }, [sentimentData]);

  // Auto-refresh: fetch on mount, then poll every 30s for cached data
  useEffect(() => {
    fetchEvents();
    fetchAirdrops();
    fetchSentiment(true); // initial live fetch

    const interval = setInterval(() => {
      fetchEvents();
      fetchAirdrops();
      fetchSentiment(); // reads cache
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  // Background ingest on first load (silent, no toast on failure)
  const hasAutoIngested = useRef(false);
  useEffect(() => {
    if (hasAutoIngested.current) return;
    hasAutoIngested.current = true;
    supabase.functions.invoke("opportunity-ingest", { method: "POST", body: {} })
      .then(({ data }) => {
        if (data?.inserted > 0) {
          toast.success(`Auto-scan found ${data.inserted} new events`);
          fetchEvents();
        }
      })
      .catch(() => {}); // silent fail for background ingest
  }, []);

  // ── Filtered data ─────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let base = events;
    if (tab === "listings") base = base.filter(e => ["listing", "futures_listing", "perpetual_listing", "deposit_open", "trading_live"].includes(e.event_type));
    else if (tab === "airdrops") base = base.filter(e => ["airdrop", "snapshot", "distribution"].includes(e.event_type));
    else if (tab === "new_assets") base = base.filter(e => e.event_type === "new_asset");
    else if (tab === "delistings") base = base.filter(e => ["delisting", "suspension"].includes(e.event_type));
    if (exchangeFilter !== "all") base = base.filter(e => e.exchange === exchangeFilter);
    if (eventTypeFilter !== "all") base = base.filter(e => e.event_type === eventTypeFilter);
    if (minConfidence > 0) base = base.filter(e => e.confidence_score >= minConfidence);
    return base;
  }, [events, tab, exchangeFilter, eventTypeFilter, minConfidence]);

  const exchanges = useMemo(() => [...new Set(events.map(e => e.exchange))].sort(), [events]);
  const eventTypes = useMemo(() => [...new Set(events.map(e => e.event_type))].sort(), [events]);

  const tabDefs: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "listings", label: "Listings", icon: "🟢", count: events.filter(e => ["listing", "futures_listing", "perpetual_listing", "deposit_open", "trading_live"].includes(e.event_type)).length },
    { key: "airdrops", label: "Airdrops", icon: "🪂", count: airdrops.length + events.filter(e => ["airdrop", "snapshot", "distribution"].includes(e.event_type)).length },
    { key: "new_assets", label: "New Assets", icon: "✨", count: events.filter(e => e.event_type === "new_asset").length },
    { key: "delistings", label: "Delistings", icon: "🔴", count: events.filter(e => ["delisting", "suspension"].includes(e.event_type)).length },
    { key: "sentiment", label: "Sentiment", icon: "📊", count: sentimentData?.news.length || 0 },
  ];

  return (
    <div className="opps-page-root">
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2>🔍 Opportunity Intelligence</h2>
          <button className="btn" onClick={runIngest} disabled={ingesting} style={{ fontSize: 11, padding: "5px 14px" }}>
            {ingesting ? "⏳ Scanning..." : "🔄 Scan Now"}
          </button>
        </div>
        <div className="panel-body">
          {/* Tabs */}
          <div className="opps-tabs">
            {tabDefs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={tab === t.key ? "btn" : "btn secondary"}
                style={{ fontSize: 11, padding: "5px 12px", flex: "1 1 auto", minWidth: 0 }}
              >
                {t.icon} {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>({t.count})</span>
              </button>
            ))}
          </div>

          {/* Sentiment tab */}
          {tab === "sentiment" ? (
            <SentimentTab
              data={sentimentData}
              loading={sentimentLoading}
              sourceFilter={sentimentSourceFilter}
              setSourceFilter={setSentimentSourceFilter}
              typeFilter={sentimentTypeFilter}
              setTypeFilter={setSentimentTypeFilter}
              onRefresh={() => fetchSentiment(true)}
            />
          ) : tab === "airdrops" ? (
            <div>
              {/* Airdrop filters */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  className="inp"
                  type="text"
                  placeholder="Search projects..."
                  value={airdropSearch}
                  onChange={e => setAirdropSearch(e.target.value)}
                  style={{ fontSize: 11, padding: "4px 8px", minWidth: 140 }}
                />
                <select className="inp" value={airdropChainFilter} onChange={e => setAirdropChainFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
                  <option value="all">All Chains</option>
                  {[...new Set(airdrops.map(a => a.chain).filter(Boolean))].sort().map(c => (
                    <option key={c!} value={c!}>{c}</option>
                  ))}
                </select>
                <select className="inp" value={airdropTaskTypeFilter} onChange={e => setAirdropTaskTypeFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
                  <option value="all">All Task Types</option>
                  {[...new Set(airdrops.flatMap(a => a.tasks.map(t => t.task_type)))].sort().map(tt => (
                    <option key={tt} value={tt}>{tt}</option>
                  ))}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>Min Confidence:</span>
                  <input
                    type="number" className="inp" value={airdropMinConfidence || ""}
                    onChange={e => setAirdropMinConfidence(parseInt(e.target.value) || 0)}
                    placeholder="0" min={0} max={100}
                    style={{ width: 50, fontSize: 11, padding: "4px 6px" }}
                  />
                </div>
              </div>

              {/* Filtered airdrop projects */}
              {(() => {
                let filtered = airdrops;
                if (airdropSearch) {
                  const q = airdropSearch.toLowerCase();
                  filtered = filtered.filter(p =>
                    p.project_name.toLowerCase().includes(q) ||
                    (p.token_symbol || "").toLowerCase().includes(q) ||
                    (p.chain || "").toLowerCase().includes(q)
                  );
                }
                if (airdropChainFilter !== "all") filtered = filtered.filter(p => p.chain === airdropChainFilter);
                if (airdropMinConfidence > 0) filtered = filtered.filter(p => p.confidence_score >= airdropMinConfidence);
                if (airdropTaskTypeFilter !== "all") filtered = filtered.filter(p => p.tasks.some(t => t.task_type === airdropTaskTypeFilter));

                return filtered.length > 0 ? (
                  <div className="opps-airdrop-grid">
                    {filtered.map(project => (
                      <AirdropCard key={project.id} project={project} onToggleTask={toggleTask} />
                    ))}
                  </div>
                ) : !loading ? (
                  <EmptyState message="No airdrops match the current filters." />
                ) : null;
              })()}

              {/* Airdrop events from listings */}
              {filteredEvents.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>
                    Exchange Airdrop Announcements
                  </div>
                  <EventTable events={filteredEvents} />
                </>
              )}

              {airdrops.length === 0 && filteredEvents.length === 0 && !loading && (
                <EmptyState message='No airdrop data yet. Click "Scan Now" to detect airdrop announcements.' />
              )}
            </div>
          ) : (
            <>
              {/* Filters for non-airdrop tabs */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <select className="inp" value={exchangeFilter} onChange={e => setExchangeFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
                  <option value="all">All Exchanges</option>
                  {exchanges.map(ex => <option key={ex} value={ex}>{ex.charAt(0).toUpperCase() + ex.slice(1)}</option>)}
                </select>
                <select className="inp" value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
                  <option value="all">All Events</option>
                  {eventTypes.map(et => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>Min Confidence:</span>
                  <input
                    type="number" className="inp" value={minConfidence || ""}
                    onChange={e => setMinConfidence(parseInt(e.target.value) || 0)}
                    placeholder="0" min={0} max={100}
                    style={{ width: 50, fontSize: 11, padding: "4px 6px" }}
                  />
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading intelligence data...</div>
              ) : filteredEvents.length === 0 ? (
                <EmptyState message='No events found. Click "Scan Now" to fetch the latest data from exchanges.' />
              ) : (
                <EventTable events={filteredEvents} />
              )}
            </>
          )}

          {/* Stats footer */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
            <span>{tab === "airdrops" ? `${airdrops.length} projects · ${filteredEvents.length} announcements` : `${filteredEvents.length} events displayed`}</span>
            <span>{events.length} total events tracked</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ───────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>No data</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>{message}</div>
    </div>
  );
}

function EventTable({ events }: { events: ListingEvent[] }) {
  return (
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
          {events.map(ev => (
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
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                  style={{ background: `${EXCHANGE_COLORS[ev.exchange] || "#666"}22`, color: EXCHANGE_COLORS[ev.exchange] || "#999" }}>
                  {ev.exchange}
                </span>
              </td>
              <td>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${EVENT_TYPE_COLORS[ev.event_type] || "#666"}18`, color: EVENT_TYPE_COLORS[ev.event_type] || "#999" }}>
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
                  <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary/70 hover:text-primary">View ↗</a>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sentiment Tab ───────────────────────────────────────────────────
const SENT_COLORS = { bullish: "hsl(142 71% 45%)", bearish: "hsl(0 84% 60%)", neutral: "hsl(43 96% 56%)" };

function SentimentTab({
  data,
  loading,
  sourceFilter,
  setSourceFilter,
  typeFilter,
  setTypeFilter,
  onRefresh,
}: {
  data: SentimentData | null;
  loading: boolean;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  onRefresh: () => void;
}) {
  if (loading && !data) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading sentiment data from Reddit, CoinGecko & more...</div>;
  }
  if (!data) {
    return <EmptyState message="Failed to load sentiment data. Try refreshing." />;
  }

  const sources = [...new Set(data.news.map(n => n.source))].sort();
  let filteredNews = data.news;
  if (sourceFilter !== "all") filteredNews = filteredNews.filter(n => n.source === sourceFilter);
  if (typeFilter !== "all") filteredNews = filteredNews.filter(n => n.sentiment === typeFilter);

  const bullishCount = data.news.filter(n => n.sentiment === "bullish").length;
  const bearishCount = data.news.filter(n => n.sentiment === "bearish").length;
  const neutralCount = data.news.filter(n => n.sentiment === "neutral").length;
  const overallScore = data.news.length > 0 ? data.news.reduce((s, n) => s + n.sentimentScore, 0) / data.news.length : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top stats row */}
      <div className="sentiment-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {/* Fear & Greed */}
        <div className="panel" style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Fear & Greed</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: data.fearGreed.value <= 25 ? "var(--bad)" : data.fearGreed.value >= 75 ? "var(--good)" : "var(--warn)" }}>
              {data.fearGreed.value}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{data.fearGreed.label}</span>
          </div>
          {data.fearGreed.history.length > 1 && (
            <MiniSparkline data={data.fearGreed.history.map(h => h.value)} color="var(--brand)" />
          )}
        </div>

        {/* Overall Sentiment */}
        <div className="panel" style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Community Mood</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: overallScore > 0.1 ? SENT_COLORS.bullish : overallScore < -0.1 ? SENT_COLORS.bearish : SENT_COLORS.neutral }}>
            {overallScore > 0.1 ? "Bullish" : overallScore < -0.1 ? "Bearish" : "Neutral"}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 10, fontWeight: 700 }}>
            <span style={{ color: SENT_COLORS.bullish }}>🟢 {bullishCount}</span>
            <span style={{ color: SENT_COLORS.neutral }}>🟡 {neutralCount}</span>
            <span style={{ color: SENT_COLORS.bearish }}>🔴 {bearishCount}</span>
          </div>
        </div>

        {/* Market Dominance */}
        <div className="panel" style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Market Dominance</div>
          <div style={{ display: "flex", gap: 2, height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ width: `${data.marketDominance.btc}%`, background: "#F7931A", height: "100%" }} />
            <div style={{ width: `${data.marketDominance.eth}%`, background: "#627EEA", height: "100%" }} />
            <div style={{ width: `${data.marketDominance.others}%`, background: "var(--muted2)", height: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 700 }}>
            <span style={{ color: "#F7931A" }}>BTC {data.marketDominance.btc.toFixed(1)}%</span>
            <span style={{ color: "#627EEA" }}>ETH {data.marketDominance.eth.toFixed(1)}%</span>
          </div>
        </div>

        {/* Live Status */}
        <div className="panel" style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Live Engine</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(142 71% 45%)", display: "inline-block", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "hsl(142 71% 45%)" }}>LIVE</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            {sources.length} feeds · {(data.coinSentiments || []).length} coins
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
            {new Date(data.lastUpdated).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Trending + Buzz row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="sentiment-two-col">
        {/* Trending Coins */}
        {data.trending.length > 0 && (
          <div className="panel" style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>🔥 Trending on CoinGecko</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.trending.slice(0, 7).map((coin, i) => (
                <div key={coin.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", width: 16 }}>#{i + 1}</span>
                  {coin.thumb && <img src={coin.thumb} alt="" style={{ width: 18, height: 18, borderRadius: 9 }} />}
                  <span style={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {coin.symbol.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{coin.name}</span>
                  {coin.priceChangePercent24h != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, minWidth: 50, textAlign: "right",
                      color: coin.priceChangePercent24h >= 0 ? SENT_COLORS.bullish : SENT_COLORS.bearish
                    }}>
                      {coin.priceChangePercent24h >= 0 ? "+" : ""}{coin.priceChangePercent24h.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Community Buzz */}
        {data.communityBuzz.length > 0 && (
          <div className="panel" style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>💬 Community Buzz</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.communityBuzz.map(b => (
                <span
                  key={b.topic}
                  style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800,
                    background: `${SENT_COLORS[b.sentiment as keyof typeof SENT_COLORS] || SENT_COLORS.neutral}18`,
                    color: SENT_COLORS[b.sentiment as keyof typeof SENT_COLORS] || SENT_COLORS.neutral,
                    border: `1px solid ${SENT_COLORS[b.sentiment as keyof typeof SENT_COLORS] || SENT_COLORS.neutral}30`,
                  }}
                >
                  {b.topic} <span style={{ opacity: 0.6 }}>×{b.mentions}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* News feed with filters */}
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="inp" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
            <option value="all">All Sources</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="inp" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }}>
            <option value="all">All Sentiment</option>
            <option value="bullish">🟢 Bullish</option>
            <option value="bearish">🔴 Bearish</option>
            <option value="neutral">🟡 Neutral</option>
          </select>
          <button className="btn secondary" onClick={onRefresh} style={{ fontSize: 10, padding: "4px 10px" }}>↻ Refresh</button>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>{filteredNews.length} posts</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredNews.slice(0, 30).map(item => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="panel"
              style={{
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start",
                textDecoration: "none", color: "inherit", transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <div style={{
                fontSize: 16, minWidth: 24, textAlign: "center", marginTop: 2,
              }}>
                {item.sourceIcon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>
                  {item.title}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{item.source}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 8,
                    background: `${SENT_COLORS[item.sentiment]}18`,
                    color: SENT_COLORS[item.sentiment],
                    textTransform: "uppercase",
                  }}>
                    {item.sentiment}
                  </span>
                  {item.coins.length > 0 && (
                    <span style={{ fontSize: 9, color: "var(--brand)", fontWeight: 700 }}>
                      {item.coins.join(" · ")}
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: "var(--muted)" }}>
                    🔥 {item.engagement > 1000 ? `${(item.engagement / 1000).toFixed(1)}k` : item.engagement}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--muted)", marginLeft: "auto" }}>
                    {timeAgo(new Date(item.timestamp).toISOString())}
                  </span>
                </div>
              </div>
            </a>
          ))}
          {filteredNews.length === 0 && (
            <EmptyState message="No posts match the current filters." />
          )}
        </div>
      </div>
    </div>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 80, h = 20;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`
  ).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", marginTop: 4 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
