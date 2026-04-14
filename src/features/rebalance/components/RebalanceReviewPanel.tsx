/**
 * RebalanceReviewPanel — Full rebalance review surface with approval actions.
 *
 * Contains: risk banner, actions table, consensus card, candidate list,
 * and explicit user approval buttons.
 */

import { useState } from 'react';
import type { RebalanceAnalysisResult } from '../api/getRebalanceAnalysis';
import { useRebalanceControls } from '../hooks/useRebalanceControls';
import RebalanceRiskBanner from './RebalanceRiskBanner';
import RebalanceActionsTable from './RebalanceActionsTable';
import RebalanceConsensusCard from './RebalanceConsensusCard';
import RebalanceCandidateList from './RebalanceCandidateList';

interface Props {
  result: RebalanceAnalysisResult | null;
  loading: boolean;
  error: string | null;
  onRunAnalysis: (options?: { skipAI?: boolean }) => Promise<void>;
}

export default function RebalanceReviewPanel({ result, loading, error, onRunAnalysis }: Props) {
  const controls = useRebalanceControls();
  const [showDetail, setShowDetail] = useState(true);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  const handleApproval = async (
    action: 'saveReview' | 'approveTrimsOnly' | 'approveTrimsAndPark' | 'approveFull' | 'reject',
  ) => {
    if (!result?.runId) {
      setApprovalMessage('No run ID — analysis may not have been persisted');
      return;
    }

    const fn = controls[action];
    const res = await fn(result.runId);
    if (res.success) {
      const labels: Record<string, string> = {
        saveReview: 'Review saved',
        approveTrimsOnly: 'Trims approved',
        approveTrimsAndPark: 'Trims + USDT parking approved',
        approveFull: 'Full review outcome approved',
        reject: 'Rebalance rejected',
      };
      setApprovalMessage(`✓ ${labels[action]}`);
    } else {
      setApprovalMessage(`✗ ${res.error || 'Failed'}`);
    }
  };

  return (
    <div id="rebalance-review-panel">
      {/* Risk Banner — always visible */}
      <RebalanceRiskBanner
        regime={result?.regime || null}
        risk={result?.portfolioRisk || null}
        onRunAnalysis={() => onRunAnalysis()}
        loading={loading}
      />

      {/* Error display */}
      {error && (
        <div style={{
          padding: '8px 14px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          marginBottom: 8,
          fontSize: 11,
          color: '#ef4444',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Non-fatal warnings */}
      {result && result.errors.length > 0 && (
        <div style={{
          padding: '6px 12px',
          background: 'rgba(234,179,8,0.08)',
          borderRadius: 6,
          marginBottom: 8,
          fontSize: 10,
          color: '#eab308',
        }}>
          {result.errors.map((e, i) => <div key={i}>ℹ️ {e}</div>)}
        </div>
      )}

      {result && (
        <>
          {/* Toggle detail */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <button
              className={`btn tiny ${showDetail ? '' : 'secondary'}`}
              onClick={() => setShowDetail(!showDetail)}
              style={{ fontSize: 10, padding: '3px 10px' }}
            >
              {showDetail ? '▼ Hide Details' : '▶ Show Details'}
            </button>
            <button
              className="btn tiny secondary"
              onClick={() => onRunAnalysis({ skipAI: true })}
              disabled={loading}
              style={{ fontSize: 10, padding: '3px 10px' }}
            >
              ⚡ Quick (No AI)
            </button>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {showDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Actions table */}
              <RebalanceActionsTable actions={result.consensus.finalActions} />

              {/* AI Consensus */}
              <RebalanceConsensusCard
                consensus={result.consensus}
                claudeReview={result.claudeReview}
                geminiReview={result.geminiReview}
              />

              {/* Candidates */}
              <RebalanceCandidateList
                candidates={result.consensus.candidates}
                useParkUsdt={result.consensus.useParkUsdt}
              />

              {/* Risk guard violations */}
              {result.riskGuardResult.violations.length > 0 && (
                <div className="panel" id="rebalance-risk-violations">
                  <div className="panel-head">
                    <h2>Risk Guard Checks</h2>
                    <span className="pill">
                      {result.riskGuardResult.violations.filter(v => v.blocked).length} blocked
                    </span>
                  </div>
                  <div className="panel-body" style={{ padding: '10px 14px' }}>
                    {result.riskGuardResult.violations.map((v, i) => (
                      <div key={i} style={{
                        padding: '4px 0',
                        fontSize: 11,
                        display: 'flex',
                        gap: 6,
                        borderBottom: i < result.riskGuardResult.violations.length - 1
                          ? '1px solid var(--line)' : 'none',
                      }}>
                        <span style={{
                          color: v.blocked ? '#ef4444' : '#eab308',
                          fontWeight: 800,
                          fontSize: 10,
                          flexShrink: 0,
                        }}>
                          {v.blocked ? '🚫' : '⚠'}
                        </span>
                        <span style={{ color: 'var(--fg)' }}>{v.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Approval actions ──────────────────────────────────────────── */}
          <div style={{
            marginTop: 10,
            padding: '10px 14px',
            background: 'var(--panel2)',
            border: '1px solid var(--line)',
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              User Approval Required
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                className="btn secondary"
                onClick={() => handleApproval('saveReview')}
                disabled={controls.saving}
                style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700 }}
              >
                💾 Save Review
              </button>
              <button
                className="btn secondary"
                onClick={() => handleApproval('approveTrimsOnly')}
                disabled={controls.saving}
                style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700 }}
              >
                ✂️ Approve Trims Only
              </button>
              <button
                className="btn secondary"
                onClick={() => handleApproval('approveTrimsAndPark')}
                disabled={controls.saving}
                style={{
                  padding: '7px 14px', fontSize: 11, fontWeight: 700,
                  background: 'rgba(234,179,8,0.1)',
                  borderColor: 'rgba(234,179,8,0.3)',
                  color: '#eab308',
                }}
              >
                🏦 Approve Trims + Park in USDT
              </button>
              <button
                className="btn primary"
                onClick={() => handleApproval('approveFull')}
                disabled={controls.saving || result.consensus.vetoed}
                style={{ padding: '7px 14px', fontSize: 11, fontWeight: 800 }}
              >
                ✓ Approve Full Candidate Review Outcome
              </button>
            </div>

            {approvalMessage && (
              <div style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                color: approvalMessage.startsWith('✓') ? '#22c55e' : '#ef4444',
              }}>
                {approvalMessage}
              </div>
            )}

            <div style={{
              marginTop: 6, fontSize: 9, color: 'var(--muted)', fontStyle: 'italic',
            }}>
              Nothing is executed automatically. Approval changes the status in the database only.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
