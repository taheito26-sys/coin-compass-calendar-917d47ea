/**
 * RebalanceRiskBanner — Top-level risk regime and concentration alert banner.
 */

import type { MarketRegime, PortfolioRiskSnapshot } from '../types/rebalance';
import type { RegimeResult } from '../engine/detectMarketRegime';

interface Props {
  regime: RegimeResult | null;
  risk: PortfolioRiskSnapshot | null;
  onRunAnalysis?: () => void;
  loading?: boolean;
}

const REGIME_COLORS: Record<MarketRegime, { bg: string; fg: string; label: string }> = {
  risk_on: { bg: 'rgba(22,163,74,0.15)', fg: '#22c55e', label: '🟢 RISK ON' },
  neutral: { bg: 'rgba(234,179,8,0.15)', fg: '#eab308', label: '🟡 NEUTRAL' },
  risk_off: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', label: '🔴 RISK OFF' },
};

const CONCENTRATION_COLORS: Record<string, { bg: string; fg: string }> = {
  low: { bg: 'rgba(22,163,74,0.1)', fg: '#22c55e' },
  medium: { bg: 'rgba(234,179,8,0.1)', fg: '#eab308' },
  high: { bg: 'rgba(239,68,68,0.1)', fg: '#ef4444' },
  critical: { bg: 'rgba(239,68,68,0.2)', fg: '#ef4444' },
};

export default function RebalanceRiskBanner({ regime, risk, onRunAnalysis, loading }: Props) {
  if (!regime && !risk) {
    return (
      <div
        id="rebalance-risk-banner"
        style={{
          padding: '12px 16px',
          background: 'var(--panel2)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>Portfolio Rebalance Analysis</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              Run analysis to check concentration risk, market regime, and rebalance opportunities
            </div>
          </div>
        </div>
        <button
          className="btn primary"
          onClick={onRunAnalysis}
          disabled={loading}
          style={{ padding: '8px 16px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}
        >
          {loading ? '⏳ Analyzing…' : '⚡ Run Rebalance Analysis'}
        </button>
      </div>
    );
  }

  const reg = regime ? REGIME_COLORS[regime.regime] : null;
  const conc = risk ? CONCENTRATION_COLORS[risk.concentrationRisk] : null;

  return (
    <div
      id="rebalance-risk-banner"
      style={{
        padding: '10px 14px',
        background: 'var(--panel2)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}
    >
      {/* Regime badge */}
      {reg && (
        <div style={{
          padding: '4px 10px',
          borderRadius: 6,
          background: reg.bg,
          border: `1px solid ${reg.fg}`,
          fontSize: 11,
          fontWeight: 800,
          color: reg.fg,
          letterSpacing: '0.03em',
        }}>
          {reg.label}
          {regime && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
            ({(regime.confidence * 100).toFixed(0)}%)
          </span>}
        </div>
      )}

      {/* Concentration badge */}
      {risk && conc && (
        <div style={{
          padding: '4px 10px',
          borderRadius: 6,
          background: conc.bg,
          border: `1px solid ${conc.fg}33`,
          fontSize: 11,
          fontWeight: 700,
          color: conc.fg,
        }}>
          Concentration: {risk.concentrationRisk.toUpperCase()}
          <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
            HHI {(risk.hhi * 10000).toFixed(0)}
          </span>
        </div>
      )}

      {/* Warnings */}
      {risk && risk.regimeWarnings.length > 0 && (
        <div style={{ flex: 1, fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
          {risk.regimeWarnings.slice(0, 2).join(' · ')}
        </div>
      )}

      {/* Re-run button */}
      <button
        className="btn tiny secondary"
        onClick={onRunAnalysis}
        disabled={loading}
        style={{ fontSize: 10, padding: '4px 10px', fontWeight: 700 }}
      >
        {loading ? '⏳' : '↻'} Re-analyze
      </button>
    </div>
  );
}
