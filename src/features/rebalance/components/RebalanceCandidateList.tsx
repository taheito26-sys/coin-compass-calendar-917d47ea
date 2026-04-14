/**
 * RebalanceCandidateList — Displays Gemini replacement candidates.
 */

import type { GeminiCandidate } from '../types/rebalance';

interface Props {
  candidates: GeminiCandidate[];
  useParkUsdt: boolean;
}

export default function RebalanceCandidateList({ candidates, useParkUsdt }: Props) {
  if (useParkUsdt && candidates.length === 0) {
    return (
      <div className="panel" id="rebalance-candidate-list">
        <div className="panel-head">
          <h2>Replacement Candidates</h2>
        </div>
        <div className="panel-body" style={{ padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏦</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>USDT Parking Recommended</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 340, margin: '0 auto' }}>
            No replacement candidates passed risk thresholds.
            Freed capital should be held in USDT until better opportunities emerge.
          </div>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) return null;

  return (
    <div className="panel" id="rebalance-candidate-list">
      <div className="panel-head">
        <h2>Replacement Candidates</h2>
        <span className="pill">{candidates.length} candidates</span>
      </div>
      <div className="panel-body" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.map((c, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <span className="mono" style={{ fontWeight: 900, fontSize: 14 }}>{c.symbol}</span>
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted)' }}>{c.role}</span>
                </div>
                <div style={{
                  padding: '2px 8px', borderRadius: 4,
                  background: c.score > 0.7 ? 'rgba(22,163,74,0.15)' : c.score > 0.4 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                  color: c.score > 0.7 ? '#22c55e' : c.score > 0.4 ? '#eab308' : '#ef4444',
                  fontSize: 11, fontWeight: 800,
                }}>
                  {(c.score * 100).toFixed(0)}%
                </div>
              </div>

              {c.why.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  {c.why.map((w, j) => (
                    <div key={j} style={{ fontSize: 10, color: '#22c55e', marginBottom: 1 }}>
                      ✓ {w}
                    </div>
                  ))}
                </div>
              )}

              {c.risks.length > 0 && (
                <div>
                  {c.risks.map((r, j) => (
                    <div key={j} style={{ fontSize: 10, color: '#ef4444', marginBottom: 1 }}>
                      ⚠ {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 8, padding: '6px 10px',
          background: 'rgba(234,179,8,0.08)', borderRadius: 6,
          fontSize: 10, color: 'var(--muted)', textAlign: 'center',
        }}>
          ⚠ All candidates require human approval before any action is taken
        </div>
      </div>
    </div>
  );
}
