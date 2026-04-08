/**
 * Project Survivability Score
 * Deterministic multi-factor scoring for project health/longevity.
 * Factors: risk signals, event diversity, exchange presence, age, confidence.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SurvivabilityProject {
  symbol: string;
  name: string | null;
  survivabilityScore: number; // 0-100
  factors: {
    exchangePresence: number;
    eventHealth: number;
    riskLevel: number;
    longevity: number;
    confidence: number;
  };
  riskLevel: string;
  exchangeCount: number;
  eventCount: number;
  firstSeen: string;
  grade: "A" | "B" | "C" | "D" | "F";
}

function gradeColor(g: string) {
  if (g === "A") return "var(--good)";
  if (g === "B") return "var(--brand)";
  if (g === "C") return "var(--warn)";
  if (g === "D") return "var(--bad)";
  return "var(--bad)";
}

function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

export default function SurvivabilityScore({ compact }: { compact?: boolean } = {}) {
  const [events, setEvents] = useState<any[]>([]);
  const [riskSignals, setRiskSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const [evRes, riskRes] = await Promise.all([
          supabase.from("listing_events")
            .select("token_symbol, token_name, exchange, event_type, confidence_score, detected_time")
            .order("detected_time", { ascending: false })
            .limit(500),
          supabase.from("risk_signal_aggregate")
            .select("token_symbol, risk_score, risk_level")
            .limit(200),
        ]);
        setEvents(evRes.data ?? []);
        setRiskSignals(riskRes.data ?? []);
      } catch (err) {
        console.error("Survivability fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const projects = useMemo((): SurvivabilityProject[] => {
    if (events.length === 0) return [];

    // Build risk lookup
    const riskMap = new Map<string, { score: number; level: string }>();
    for (const r of riskSignals) {
      riskMap.set(r.token_symbol?.toUpperCase(), { score: r.risk_score, level: r.risk_level });
    }

    // Group events by token
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
        const sortedByTime = evts.sort((a: any, b: any) => new Date(a.detected_time).getTime() - new Date(b.detected_time).getTime());
        const firstSeen = sortedByTime[0].detected_time;
        const ageDays = (Date.now() - new Date(firstSeen).getTime()) / 86400000;

        const risk = riskMap.get(symbol);
        const hasDelisting = eventTypes.includes("delisting");

        // Factor scores (each 0-20, total 0-100)
        const exchangePresence = Math.min(20, exchanges.length * 7); // multi-exchange = healthy
        const eventHealth = hasDelisting ? 2 : Math.min(20, eventTypes.length * 5); // delistings kill score
        const riskLevel = risk ? Math.max(0, 20 - risk.score * 0.2) : 10; // low risk = high score
        const longevity = Math.min(20, ageDays * 0.7); // older = more proven
        const confidence = Math.min(20, avgConfidence * 0.2);

        const survivabilityScore = Math.round(exchangePresence + eventHealth + riskLevel + longevity + confidence);

        return {
          symbol,
          name: evts[0].token_name,
          survivabilityScore,
          factors: { exchangePresence, eventHealth, riskLevel, longevity, confidence },
          riskLevel: risk?.level ?? "UNKNOWN",
          exchangeCount: exchanges.length,
          eventCount: evts.length,
          firstSeen,
          grade: getGrade(survivabilityScore),
        };
      })
      .sort((a, b) => b.survivabilityScore - a.survivabilityScore)
      .slice(0, compact ? 8 : 15);
  }, [events, riskSignals, compact]);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-head"><h2>Survivability Score</h2></div>
        <div className="panel-body" style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Analyzing...</div>
      </div>
    );
  }

  const aCount = projects.filter(p => p.grade === "A").length;
  const fCount = projects.filter(p => p.grade === "D" || p.grade === "F").length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Survivability Score</h2>
        <span className="pill" style={{ fontSize: 10 }}>{projects.length} scored</span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 320 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* Summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>A-GRADE</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: "var(--good)" }}>{aCount}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>AT RISK</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: fCount > 0 ? "var(--bad)" : "var(--good)" }}>{fCount}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>TOTAL</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900 }}>{projects.length}</div>
          </div>
        </div>

        {projects.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
            No projects to score. Run Opportunity Scan first.
          </div>
        ) : (
          <div className="tableWrap">
            <table style={compact ? { fontSize: 10 } : undefined}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th style={{ textAlign: "center" }}>Grade</th>
                  <th style={{ textAlign: "right" }}>Score</th>
                  {!compact && <th style={{ textAlign: "center" }}>Risk</th>}
                  {!compact && <th style={{ textAlign: "right" }}>Exchanges</th>}
                  <th style={{ textAlign: "right" }}>Events</th>
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
                      <span style={{
                        display: "inline-block", width: 24, height: 24, lineHeight: "24px",
                        borderRadius: 6, fontWeight: 900, fontSize: compact ? 11 : 13,
                        background: gradeColor(p.grade) + "22",
                        color: gradeColor(p.grade),
                        border: `1px solid ${gradeColor(p.grade)}44`,
                        textAlign: "center",
                      }}>
                        {p.grade}
                      </span>
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 900 }}>{p.survivabilityScore}</td>
                    {!compact && (
                      <td style={{ textAlign: "center" }}>
                        <span className="pill" style={{
                          fontSize: 8, fontWeight: 700,
                          background: p.riskLevel === "LOW" ? "var(--good)" : p.riskLevel === "MEDIUM" ? "var(--warn)" : p.riskLevel === "HIGH" ? "var(--bad)" : "var(--muted)",
                          color: "#fff",
                        }}>
                          {p.riskLevel}
                        </span>
                      </td>
                    )}
                    {!compact && <td className="mono" style={{ textAlign: "right" }}>{p.exchangeCount}</td>}
                    <td className="mono" style={{ textAlign: "right" }}>{p.eventCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Factor breakdown for top project */}
        {!compact && projects.length > 0 && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>
              FACTOR BREAKDOWN — {projects[0].symbol}
            </div>
            {Object.entries(projects[0].factors).map(([key, val]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 9, width: 80, color: "var(--muted)", textTransform: "capitalize" }}>
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <div style={{ flex: 1, height: 4, background: "var(--panel3)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(val / 20) * 100}%`, background: "var(--brand)", borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", width: 24 }}>{Math.round(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
