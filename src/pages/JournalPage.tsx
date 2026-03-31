import React, { useState, useMemo, useEffect } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { fmtFiat } from "@/lib/cryptoState";
import { toast } from "sonner";

interface JournalEntry {
  date: string;
  note: string;
  sentiment: "bullish" | "bearish" | "neutral";
  pnl?: number;
}

export default function JournalPage() {
  const { state } = useCrypto();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [todayNote, setTodayNote] = useState("");
  const [todaySentiment, setTodaySentiment] = useState<"bullish" | "bearish" | "neutral">("neutral");

  // Mock initial entries or load from state if added there later
  useEffect(() => {
    const saved = localStorage.getItem("trading_journal");
    if (saved) {
      try { setEntries(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayEntry = entries.find(e => e.date === todayStr);

  const saveToday = () => {
    const newEntries = entries.filter(e => e.date !== todayStr);
    newEntries.push({
      date: todayStr,
      note: todayNote || (todayEntry?.note || ""),
      sentiment: todaySentiment,
      pnl: 0 // In a real app, calculate from state
    });
    setEntries(newEntries);
    localStorage.setItem("trading_journal", JSON.stringify(newEntries));
    toast.success("Journal saved for " + todayStr);
  };

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);

  return (
    <div className="journal-page" style={{ padding: 10 }}>
      {/* Today's Entry */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Today's Logic & Analysis · <span className="muted">{todayStr}</span></h2>
          <button className="btn primary tiny" onClick={saveToday}>Save Entry</button>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
            <div>
              <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>What's your rationale today?</label>
              <textarea 
                className="inp" 
                placeholder="e.g. Bought the BTC dip because RSI hit 30 on the 4H chart..."
                value={todayNote}
                onChange={e => setTodayNote(e.target.value)}
                style={{ width: "100%", height: 120, padding: 12, marginTop: 6, resize: "none", fontSize: 13, lineHeight: 1.6 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
               <div>
                  <label style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Market Bias</label>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    {(["bullish", "neutral", "bearish"] as const).map(s => (
                      <button 
                        key={s} className={`btn tiny ${todaySentiment === s ? "primary" : "secondary"}`}
                        onClick={() => setTodaySentiment(s)}
                        style={{ flex: 1, textTransform: "capitalize" }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
               </div>
               <div style={{ background: "var(--panel2)", padding: 16, borderRadius: 12, border: "1px dashed var(--line)" }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Today's Performance</div>
                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>$0.00</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Calculated from current live session.</div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="panel">
        <div className="panel-head">
          <h2>Archive · <span className="muted">Previous Insights</span></h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th style={{ width: 100 }}>Bias</th>
                  <th>Observation / Rationale</th>
                  <th style={{ textAlign: "right" }}>P&L</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length > 0 ? sortedEntries.map(e => (
                  <tr key={e.date}>
                    <td className="mono" style={{ fontWeight: 800 }}>{e.date}</td>
                    <td>
                       <span className={`pill ${e.sentiment === "bullish" ? "good" : e.sentiment === "bearish" ? "bad" : ""}`} style={{ fontSize: 10 }}>
                         {e.sentiment.toUpperCase()}
                       </span>
                    </td>
                    <td style={{ fontSize: 12, lineHeight: 1.4, color: "var(--text)" }}>{e.note}</td>
                    <td style={{ textAlign: "right" }} className="mono muted">—</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="muted" style={{ padding: 40, textAlign: "center" }}>No historical logs found. Start journaling your trades today.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
