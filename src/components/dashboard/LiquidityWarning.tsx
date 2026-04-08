/**
 * Liquidity Collapse Warning
 * Monitors 24h volume changes and volume/market-cap ratios to detect
 * liquidity deterioration across portfolio holdings.
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtTotal } from "@/lib/cryptoState";

interface LiquidityAlert {
  sym: string;
  mv: number;
  volume24h: number;
  volumeToMcap: number;
  priceChange24h: number;
  severity: "ok" | "warn" | "danger";
  reason: string;
}

const THRESHOLDS = {
  vol_mcap_low: 0.02,       // <2% volume/mcap = illiquid
  vol_mcap_danger: 0.005,   // <0.5% = extremely illiquid
  price_drop_warn: -5,      // >5% drop with low volume
  price_drop_danger: -10,   // >10% drop
};

function severityColor(s: string) {
  if (s === "danger") return "var(--bad)";
  if (s === "warn") return "var(--warn)";
  return "var(--good)";
}

export default function LiquidityWarning({ compact }: { compact?: boolean } = {}) {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const analysis = useMemo(() => {
    if (totalMV <= 0 || positions.length === 0) return null;

    const alerts: LiquidityAlert[] = positions
      .map(p => {
        const live = getPrice(p.sym);
        const price = live?.current_price ?? p.price ?? 0;
        const mv = price * p.qty;
        const volume24h = live?.total_volume ?? 0;
        const marketCap = live?.market_cap ?? 0;
        const priceChange24h = live?.price_change_percentage_24h_in_currency ?? 0;
        const volumeToMcap = marketCap > 0 ? volume24h / marketCap : 0;

        let severity: "ok" | "warn" | "danger" = "ok";
        let reason = "Healthy liquidity";

        if (volumeToMcap < THRESHOLDS.vol_mcap_danger && marketCap > 0) {
          severity = "danger";
          reason = `Extremely low volume/mcap ratio (${(volumeToMcap * 100).toFixed(2)}%)`;
        } else if (volumeToMcap < THRESHOLDS.vol_mcap_low && marketCap > 0) {
          severity = "warn";
          reason = `Low volume/mcap ratio (${(volumeToMcap * 100).toFixed(2)}%)`;
        }

        if (priceChange24h <= THRESHOLDS.price_drop_danger && severity !== "danger") {
          severity = "danger";
          reason = `Sharp price drop (${priceChange24h.toFixed(1)}%) may indicate liquidity crisis`;
        } else if (priceChange24h <= THRESHOLDS.price_drop_warn && severity === "ok") {
          severity = "warn";
          reason = `Notable price decline (${priceChange24h.toFixed(1)}%)`;
        }

        return { sym: p.sym, mv, volume24h, volumeToMcap, priceChange24h, severity, reason };
      })
      .filter(a => a.mv > 0)
      .sort((a, b) => {
        const sev = { danger: 0, warn: 1, ok: 2 };
        return sev[a.severity] - sev[b.severity] || b.mv - a.mv;
      });

    const dangerCount = alerts.filter(a => a.severity === "danger").length;
    const warnCount = alerts.filter(a => a.severity === "warn").length;
    const totalVolume = alerts.reduce((s, a) => s + a.volume24h, 0);
    const overallLevel = dangerCount > 0 ? "danger" : warnCount > 0 ? "warn" : "ok";

    return { alerts, dangerCount, warnCount, totalVolume, overallLevel };
  }, [positions, totalMV, getPrice]);

  if (!analysis) return null;

  const { alerts, dangerCount, warnCount, totalVolume, overallLevel } = analysis;
  const levelLabel = overallLevel === "danger" ? "Critical" : overallLevel === "warn" ? "Caution" : "Stable";

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Liquidity Monitor</h2>
        <span className="pill" style={{ background: severityColor(overallLevel), color: "#fff", fontWeight: 700 }}>
          {levelLabel}
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0, maxHeight: compact ? 300 : undefined, overflow: compact ? "auto" : undefined }}>
        {/* Summary */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1, background: "var(--line)", borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>24H VOLUME</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900 }}>{fmtTotal(totalVolume)}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>WARNINGS</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900, color: warnCount > 0 ? "var(--warn)" : "var(--good)" }}>{warnCount}</div>
          </div>
          <div style={{ background: "var(--card)", padding: compact ? "6px 4px" : "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: compact ? 8 : 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>CRITICAL</div>
            <div style={{ fontSize: compact ? 11 : 14, fontWeight: 900, color: dangerCount > 0 ? "var(--bad)" : "var(--good)" }}>{dangerCount}</div>
          </div>
        </div>

        {/* Asset liquidity table */}
        <div className="tableWrap">
          <table style={compact ? { fontSize: 10 } : undefined}>
            <thead>
              <tr>
                <th>Asset</th>
                <th style={{ textAlign: "right" }}>24h Vol</th>
                {!compact && <th style={{ textAlign: "right" }}>Vol/MCap</th>}
                <th style={{ textAlign: "right" }}>24h Δ</th>
                <th style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, compact ? 6 : 12).map(a => (
                <tr key={a.sym}>
                  <td className="mono" style={{ fontWeight: 900 }}>{a.sym}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtTotal(a.volume24h)}</td>
                  {!compact && (
                    <td className="mono" style={{ textAlign: "right", color: a.volumeToMcap < THRESHOLDS.vol_mcap_low ? "var(--warn)" : "var(--muted)" }}>
                      {a.volumeToMcap > 0 ? (a.volumeToMcap * 100).toFixed(2) + "%" : "—"}
                    </td>
                  )}
                  <td className="mono" style={{ textAlign: "right", color: a.priceChange24h >= 0 ? "var(--good)" : "var(--bad)" }}>
                    {a.priceChange24h >= 0 ? "+" : ""}{a.priceChange24h.toFixed(1)}%
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="pill" style={{ fontSize: 8, background: severityColor(a.severity), color: "#fff", fontWeight: 700 }}>
                      {a.severity === "danger" ? "CRITICAL" : a.severity === "warn" ? "WARN" : "OK"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Danger alerts */}
        {alerts.filter(a => a.severity !== "ok").length > 0 && (
          <div style={{ padding: compact ? "6px 10px" : "8px 14px", borderTop: "1px solid var(--line)" }}>
            {alerts.filter(a => a.severity !== "ok").slice(0, compact ? 2 : 4).map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: compact ? 9 : 10 }}>
                <span>{a.severity === "danger" ? "🔴" : "🟡"}</span>
                <span style={{ fontWeight: 700 }}>{a.sym}:</span>
                <span style={{ color: "var(--muted)" }}>{a.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
