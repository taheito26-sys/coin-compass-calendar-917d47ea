/**
 * Asset Concentration Risk Detector
 * Identifies over-concentration in single assets and provides actionable alerts.
 * Uses HHI (Herfindahl-Hirschman Index) and per-asset weight thresholds.
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtTotal } from "@/lib/cryptoState";

interface ConcentrationAlert {
  sym: string;
  weight: number;
  mv: number;
  severity: "info" | "warn" | "danger";
  message: string;
}

const THRESHOLDS = {
  single_warn: 0.30,   // >30% in one asset
  single_danger: 0.50,  // >50% in one asset
  top2_warn: 0.60,      // top 2 assets > 60%
  top3_danger: 0.80,    // top 3 assets > 80%
  hhi_moderate: 0.18,   // HHI moderate concentration
  hhi_high: 0.35,       // HHI high concentration
};

function hhi(weights: number[]): number {
  return weights.reduce((s, w) => s + w * w, 0);
}

function hhiLabel(h: number): { label: string; color: string } {
  if (h < THRESHOLDS.hhi_moderate) return { label: "Diversified", color: "var(--good)" };
  if (h < THRESHOLDS.hhi_high) return { label: "Moderate", color: "var(--warn)" };
  return { label: "Concentrated", color: "var(--bad)" };
}

export default function ConcentrationRisk({ compact }: { compact?: boolean } = {}) {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const analysis = useMemo(() => {
    if (totalMV <= 0 || positions.length === 0) return null;

    const weighted = positions
      .map(p => {
        const live = getPrice(p.sym);
        const price = live?.current_price ?? p.price ?? 0;
        const mv = price * p.qty;
        return { sym: p.sym, mv, weight: mv / totalMV };
      })
      .filter(p => p.mv > 0)
      .sort((a, b) => b.weight - a.weight);

    if (weighted.length === 0) return null;

    const weights = weighted.map(w => w.weight);
    const hhiVal = hhi(weights);
    const hhiInfo = hhiLabel(hhiVal);

    // Generate alerts
    const alerts: ConcentrationAlert[] = [];

    // Single asset alerts
    for (const w of weighted) {
      if (w.weight >= THRESHOLDS.single_danger) {
        alerts.push({
          sym: w.sym, weight: w.weight, mv: w.mv, severity: "danger",
          message: `${w.sym} is ${(w.weight * 100).toFixed(1)}% of portfolio — extreme concentration risk`,
        });
      } else if (w.weight >= THRESHOLDS.single_warn) {
        alerts.push({
          sym: w.sym, weight: w.weight, mv: w.mv, severity: "warn",
          message: `${w.sym} is ${(w.weight * 100).toFixed(1)}% of portfolio — consider rebalancing`,
        });
      }
    }

    // Top-N alerts
    if (weighted.length >= 2) {
      const top2 = weighted[0].weight + weighted[1].weight;
      if (top2 >= THRESHOLDS.top2_warn) {
        alerts.push({
          sym: `${weighted[0].sym}+${weighted[1].sym}`, weight: top2, mv: weighted[0].mv + weighted[1].mv,
          severity: "warn",
          message: `Top 2 assets (${weighted[0].sym}, ${weighted[1].sym}) are ${(top2 * 100).toFixed(0)}% of portfolio`,
        });
      }
    }
    if (weighted.length >= 3) {
      const top3 = weighted[0].weight + weighted[1].weight + weighted[2].weight;
      if (top3 >= THRESHOLDS.top3_danger) {
        alerts.push({
          sym: `Top 3`, weight: top3, mv: weighted[0].mv + weighted[1].mv + weighted[2].mv,
          severity: "danger",
          message: `Top 3 assets control ${(top3 * 100).toFixed(0)}% — portfolio highly concentrated`,
        });
      }
    }

    // Ideal weight (equal-weight benchmark)
    const idealWeight = 1 / weighted.length;

    return { weighted: weighted.slice(0, 8), hhiVal, hhiInfo, alerts, idealWeight, assetCount: weighted.length };
  }, [positions, totalMV, getPrice]);

  if (!analysis) return null;

  const { weighted, hhiVal, hhiInfo, alerts, idealWeight, assetCount } = analysis;
  const severityColor = { info: "var(--brand)", warn: "var(--warn)", danger: "var(--bad)" };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Concentration Risk</h2>
        <span className="pill" style={{ background: hhiInfo.color, color: "#fff", fontWeight: 700 }}>
          {hhiInfo.label}
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 320 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* HHI Summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>HHI INDEX</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: hhiInfo.color }}>
              {(hhiVal * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>TOP ASSET</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900 }}>
              {weighted[0]?.sym} · {(weighted[0]?.weight * 100).toFixed(0)}%
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>IDEAL WT</div>
            <div style={{ fontSize: compact ? 12 : 16, fontWeight: 900, color: "var(--muted)" }}>
              {(idealWeight * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ padding: compact ? "6px 10px" : "10px 14px", borderBottom: "1px solid var(--line)" }}>
            {alerts.slice(0, compact ? 2 : 5).map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 0", fontSize: compact ? 10 : 11, color: severityColor[a.severity],
                borderBottom: i < alerts.length - 1 ? "1px solid var(--line)" : "none",
              }}>
                <span style={{ fontSize: 14 }}>{a.severity === "danger" ? "🔴" : "🟡"}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{a.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Weight bar chart */}
        <div style={{ padding: compact ? "6px 10px" : "10px 14px" }}>
          {weighted.map(w => {
            const drift = w.weight - idealWeight;
            const barColor = w.weight >= THRESHOLDS.single_danger
              ? "var(--bad)" : w.weight >= THRESHOLDS.single_warn
                ? "var(--warn)" : "var(--brand)";
            return (
              <div key={w.sym} style={{ marginBottom: compact ? 4 : 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: compact ? 9 : 11, marginBottom: 2 }}>
                  <span style={{ fontWeight: 800 }}>{w.sym}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {(w.weight * 100).toFixed(1)}%
                    <span style={{
                      marginLeft: 6, fontSize: compact ? 8 : 9, fontWeight: 600,
                      color: drift > 0 ? "var(--bad)" : "var(--good)",
                    }}>
                      {drift > 0 ? "+" : ""}{(drift * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
                <div style={{ height: compact ? 4 : 6, background: "var(--panel3)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%", width: `${Math.min(100, w.weight * 100)}%`,
                    background: barColor, borderRadius: 3, transition: "width 0.3s",
                  }} />
                  {/* Ideal line */}
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, left: `${idealWeight * 100}%`,
                    width: 1, background: "var(--muted)", opacity: 0.5,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
