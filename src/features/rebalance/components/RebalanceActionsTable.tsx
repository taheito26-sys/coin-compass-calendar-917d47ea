/**
 * RebalanceActionsTable — Displays proposed rebalance actions.
 */

import type { RebalanceAction } from '../types/rebalance';

interface Props {
  actions: RebalanceAction[];
}

const ACTION_STYLES: Record<string, { bg: string; fg: string; icon: string }> = {
  trim: { bg: 'rgba(239,68,68,0.12)', fg: '#ef4444', icon: '✂️' },
  hold: { bg: 'rgba(22,163,74,0.12)', fg: '#22c55e', icon: '✓' },
  park_usdt: { bg: 'rgba(234,179,8,0.12)', fg: '#eab308', icon: '🏦' },
  replace_candidate_review: { bg: 'rgba(99,102,241,0.12)', fg: '#6366f1', icon: '🔄' },
  no_action: { bg: 'rgba(161,161,170,0.08)', fg: '#a1a1aa', icon: '—' },
};

export default function RebalanceActionsTable({ actions }: Props) {
  if (actions.length === 0) return null;

  // Separate meaningful actions from holds
  const meaningful = actions.filter(a => a.action !== 'hold' && a.action !== 'no_action');
  const holds = actions.filter(a => a.action === 'hold');
  const noActions = actions.filter(a => a.action === 'no_action');

  return (
    <div className="panel" id="rebalance-actions-table">
      <div className="panel-head">
        <h2>Proposed Actions</h2>
        <span className="pill">{meaningful.length} changes</span>
      </div>
      <div className="panel-body" style={{ padding: 0, overflow: 'auto' }}>
        {meaningful.length > 0 ? (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Asset</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reasons</th>
                </tr>
              </thead>
              <tbody>
                {meaningful.map((a, i) => {
                  const style = ACTION_STYLES[a.action] || ACTION_STYLES.no_action;
                  return (
                    <tr key={i}>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: style.bg,
                          color: style.fg,
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}>
                          {style.icon} {a.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 900 }}>{a.symbol}</td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {a.fromWeight !== undefined ? `${(a.fromWeight * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {a.toWeight !== undefined ? `${(a.toWeight * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 250 }}>
                        {a.reasonCodes.slice(0, 3).join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
            {noActions.length > 0 ? 'No rebalance needed — portfolio within parameters' : 'No actions to display'}
          </div>
        )}

        {holds.length > 0 && (
          <div style={{
            borderTop: '1px solid var(--line)',
            padding: '8px 12px',
            fontSize: 10,
            color: 'var(--muted)',
          }}>
            <strong style={{ color: '#22c55e' }}>✓ HOLD</strong>: {holds.map(h => h.symbol).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
