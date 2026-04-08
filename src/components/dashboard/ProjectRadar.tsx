/**
 * Early Stage Project Radar
 * Scans listing_events for recently detected projects and scores their
 * early-stage potential based on exchange count, event recency, and confidence.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RadarProject {
  symbol: string;
  name: string | null;
  exchanges: string[];
  eventCount: number;
  firstSeen: string;
  latestEvent: string;
  avgConfidence: number;
  radarScore: number; // 0-100
  eventTypes: string[];
}

function scoreColor(s: number) {
  if (s >= 70) return "var(--good)";
  if (s >= 40) return "var(--warn)";
  return "var(--muted)";
}

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const hrs = ms / 3600000;
  if (hrs < 1) return `${Math.round(hrs * 60)}m ago`;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function ProjectRadar({ compact }: { compact?: boolean } = {}) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        // Get recent listing events from last 30 days
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data } = await supabase
          .from("listing_events")
          .select("token_symbol, token_name, exchange, event_type, confidence_score, detected_time")
          .gte("detected_time", cutoff)
          .order("detected_time", { ascending: false })
          .limit(500);
        setEvents(data ?? []);
      } catch (err) {
        console.error("Radar fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const projects = useMemo((): RadarProject[] => {
    if (events.length === 0) return [];

    // Group by token symbol
    const grouped = new Map<string, typeof events>();
    for (const ev of events) {
      const sym = ev.token_symbol?.toUpperCase();
      if (!sym) continue;
      if (!grouped.has(sym)) grouped.set(sym, []);
      grouped.get(sym)!.push(ev);
    }

    return Array.from(grouped.entries())
      .map(([symbol, evts]) => {
        const exchanges = [...new Set(evts.map((e: any) => e.exchange))];
        const eventTypes = [...new Set(evts.map((e: any) => e.event_type))];
        const avgConfidence = evts.reduce((s: number, e: any) => s + (e.confidence_score || 0), 0) / evts.length;
        const sortedByTime = evts.sort((a: any, b: any) => new Date(b.detected_time).getTime() - new Date(a.detected_time).getTime());
        const firstSeen = sortedByTime[sortedByTime.length - 1].detected_time;
        const latestEvent = sortedByTime[0].detected_time;

        // Radar score: multi-exchange presence (30), recency (25), confidence (25), event diversity (20)
        const exchangeScore = Math.min(30, exchanges.length * 10);
        const recencyHrs = (Date.now() - new Date(latestEvent).getTime()) / 3600000;
        const recencyScore = recencyHrs < 6 ? 25 : recencyHrs < 24 ? 18 : recencyHrs < 72 ? 12 : recencyHrs < 168 ? 6 : 2;
        const confScore = Math.round(avgConfidence * 0.25);
        const diversityScore = Math.min(20, eventTypes.length * 7);
        const radarScore = Math.min(100, exchangeScore + recencyScore + confScore + diversityScore);

        return {
          symbol,
          name: evts[0].token_name,
          exchanges,
          eventCount: evts.length,
          firstSeen,
          latestEvent,
          avgConfidence,
          radarScore,
          eventTypes,
        };
      })
      .sort((a, b) => b.radarScore - a.radarScore)
      .slice(0, compact ? 8 : 15);
  }, [events, compact]);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Project Radar</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Scanning...</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Project Radar</h2>
        <span className="pill" style={{ fontSize: 10 }}>{projects.length} projects</span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 300 : undefined, overflow: compact ? "auto" : undefined }}>
        {projects.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
            No recent projects detected. Run Opportunity Scan to populate data.
          </div>
        ) : (
          <div className="tableWrap">
            <table style={compact ? { fontSize: 10 } : undefined}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th style={{ textAlign: "center" }}>Exchanges</th>
                  <th style={{ textAlign: "right" }}>Events</th>
                  {!compact && <th style={{ textAlign: "right" }}>Confidence</th>}
                  <th style={{ textAlign: "right" }}>Detected</th>
                  <th style={{ textAlign: "center" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.symbol}>
                    <td>
                      <div style={{ fontWeight: 900, fontFamily: "monospace" }}>{p.symbol}</div>
                      {p.name && !compact && (
                        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 1 }}>{p.name}</div>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                        {p.exchanges.slice(0, 3).map(ex => (
                          <span key={ex} className="pill" style={{ fontSize: 7, fontWeight: 600 }}>{ex}</span>
                        ))}
                        {p.exchanges.length > 3 && (
                          <span style={{ fontSize: 8, color: "var(--muted)" }}>+{p.exchanges.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>{p.eventCount}</td>
                    {!compact && (
                      <td className="mono" style={{ textAlign: "right" }}>{Math.round(p.avgConfidence)}</td>
                    )}
                    <td style={{ textAlign: "right", fontSize: compact ? 9 : 10, color: "var(--muted)" }}>
                      {timeAgo(p.latestEvent)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", minWidth: 28, padding: "2px 6px",
                        borderRadius: 6, fontSize: compact ? 9 : 10,
                        fontWeight: 900, fontFamily: "monospace",
                        background: scoreColor(p.radarScore) + "22",
                        color: scoreColor(p.radarScore),
                        border: `1px solid ${scoreColor(p.radarScore)}44`,
                      }}>
                        {p.radarScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
