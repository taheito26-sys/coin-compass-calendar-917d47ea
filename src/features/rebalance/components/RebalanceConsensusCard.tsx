/**
 * RebalanceConsensusCard — Shows the final consensus result with AI verdicts.
 */

import type { ConsensusResult, ClaudeReview, GeminiReview } from '../types/rebalance';

interface Props {
  consensus: ConsensusResult | null;
  claudeReview: ClaudeReview | null;
  geminiReview: GeminiReview | null;
}

const VERDICT_COLORS: Record<string, { bg: string; fg: string }> = {
  approve: { bg: 'rgba(22,163,74,0.15)', fg: '#22c55e' },
  approve_with_caution: { bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  veto: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
  replace: { bg: 'rgba(99,102,241,0.15)', fg: '#6366f1' },
  hold_usdt: { bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  no_action: { bg: 'rgba(161,161,170,0.1)', fg: '#a1a1aa' },
};

function VerdictBadge({ verdict, label }: { verdict: string; label: string }) {
  const style = VERDICT_COLORS[verdict] || VERDICT_COLORS.no_action;
  return (
    <span style={{
      padding: '3px 8px',
      borderRadius: 4,
      background: style.bg,
      color: style.fg,
      fontSize: 10,
      fontWeight: 800,
      textTransform: 'uppercase',
    }}>
      {label}: {verdict.replace(/_/g, ' ')}
    </span>
  );
}

export default function RebalanceConsensusCard({ consensus, claudeReview, geminiReview }: Props) {
  if (!consensus) return null;

  return (
    <div className="panel" id="rebalance-consensus-card">
      <div className="panel-head">
        <h2>AI Consensus</h2>
        {consensus.vetoed && (
          <span style={{
            padding: '2px 8px', borderRadius: 4,
            background: 'rgba(239,68,68,0.2)', color: '#ef4444',
            fontSize: 10, fontWeight: 800,
          }}>
            VETOED
          </span>
        )}
      </div>
      <div className="panel-body" style={{ padding: '12px 14px' }}>
        {/* Verdicts row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {consensus.claudeVerdict && (
            <VerdictBadge verdict={consensus.claudeVerdict} label="Claude" />
          )}
          {consensus.geminiVerdict && (
            <VerdictBadge verdict={consensus.geminiVerdict} label="Gemini" />
          )}
          {consensus.useParkUsdt && (
            <span style={{
              padding: '3px 8px', borderRadius: 4,
              background: 'rgba(234,179,8,0.15)', color: '#eab308',
              fontSize: 10, fontWeight: 800,
            }}>
              🏦 USDT PARKING RECOMMENDED
            </span>
          )}
        </div>

        {/* Claude review details */}
        {claudeReview && (
          <div style={{
            marginBottom: 10, padding: '8px 10px',
            background: 'var(--panel)', borderRadius: 6,
            border: '1px solid var(--line)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
              Claude Risk Critique · Confidence: {(claudeReview.confidence * 100).toFixed(0)}%
            </div>

            {claudeReview.riskFindings.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {claudeReview.riskFindings.map((f, i) => (
                  <div key={i} style={{
                    fontSize: 11, marginBottom: 3, display: 'flex', gap: 6, alignItems: 'flex-start',
                  }}>
                    <span style={{
                      padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                      color: f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#eab308' : '#22c55e',
                      background: f.severity === 'high' ? 'rgba(239,68,68,0.1)' : f.severity === 'medium' ? 'rgba(234,179,8,0.1)' : 'rgba(22,163,74,0.1)',
                      textTransform: 'uppercase', flexShrink: 0,
                    }}>
                      {f.severity}
                    </span>
                    <span style={{ color: 'var(--fg)', fontSize: 11 }}>{f.message}</span>
                  </div>
                ))}
              </div>
            )}

            {claudeReview.criticisms.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {claudeReview.criticisms.map((c, i) => (
                  <div key={i} style={{ marginBottom: 2 }}>⚠ {c}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gemini review details */}
        {geminiReview && (
          <div style={{
            padding: '8px 10px',
            background: 'var(--panel)', borderRadius: 6,
            border: '1px solid var(--line)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
              Gemini Market Synthesis · Confidence: {(geminiReview.confidence * 100).toFixed(0)}%
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--fg)' }}>
                Regime: <strong>{geminiReview.marketSummary.regime}</strong>
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg)' }}>
                Sentiment: <strong>{geminiReview.marketSummary.sentiment}</strong>
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg)' }}>
                Breadth: <strong>{geminiReview.marketSummary.breadth}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Veto reasons */}
        {consensus.vetoReasons.length > 0 && (
          <div style={{
            marginTop: 8, padding: '8px 10px',
            background: consensus.vetoed ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.08)',
            borderRadius: 6, fontSize: 10, color: 'var(--muted)',
          }}>
            {consensus.vetoReasons.map((r, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                {consensus.vetoed ? '🚫' : 'ℹ️'} {r}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
