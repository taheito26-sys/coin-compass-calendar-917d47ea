/**
 * saveRebalanceDecision — Persist user approval/rejection decisions.
 *
 * Updates rebalance_runs status and individual action statuses.
 * No auto-execution: status only changes to approved/rejected.
 */

import { supabase } from '@/integrations/supabase/client';
import type { RebalanceRunStatus, RebalanceActionStatus } from '../types/rebalance';

export type ApprovalType =
  | 'save_review'
  | 'approve_trims_only'
  | 'approve_trims_park'
  | 'approve_full'
  | 'reject';

/**
 * Map approval type to run status.
 */
function mapApprovalToStatus(approval: ApprovalType): RebalanceRunStatus {
  switch (approval) {
    case 'save_review': return 'analysis_complete';
    case 'approve_trims_only': return 'approved_trims_only';
    case 'approve_trims_park': return 'approved_trims_park';
    case 'approve_full': return 'approved_full';
    case 'reject': return 'rejected';
  }
}

/**
 * Determine which action types to approve based on approval type.
 */
function getApprovedActionTypes(approval: ApprovalType): Set<string> {
  switch (approval) {
    case 'approve_trims_only':
      return new Set(['trim']);
    case 'approve_trims_park':
      return new Set(['trim', 'park_usdt']);
    case 'approve_full':
      return new Set(['trim', 'park_usdt', 'replace_candidate_review']);
    default:
      return new Set();
  }
}

export interface SaveDecisionResult {
  success: boolean;
  error?: string;
}

/**
 * Save a user's approval or rejection of a rebalance run.
 */
export async function saveRebalanceDecision(
  runId: string,
  approval: ApprovalType,
): Promise<SaveDecisionResult> {
  try {
    const newStatus = mapApprovalToStatus(approval);

    // Update run status
    const { error: runErr } = await supabase
      .from('rebalance_runs')
      .update({ status: newStatus })
      .eq('id', runId);

    if (runErr) {
      return { success: false, error: `Failed to update run: ${runErr.message}` };
    }

    // Update individual action statuses
    if (approval === 'reject') {
      // Reject all actions
      const { error: actErr } = await supabase
        .from('rebalance_actions')
        .update({ status: 'rejected' as RebalanceActionStatus })
        .eq('run_id', runId);

      if (actErr) {
        return { success: false, error: `Failed to update actions: ${actErr.message}` };
      }
    } else if (approval !== 'save_review') {
      // Approve matching action types, leave others as proposed
      const approvedTypes = getApprovedActionTypes(approval);

      // Get all actions for this run
      const { data: actions, error: fetchErr } = await supabase
        .from('rebalance_actions')
        .select('id, action')
        .eq('run_id', runId);

      if (fetchErr) {
        return { success: false, error: `Failed to fetch actions: ${fetchErr.message}` };
      }

      if (actions) {
        for (const action of actions) {
          const newActionStatus: RebalanceActionStatus = approvedTypes.has(action.action)
            ? 'approved'
            : 'proposed';

          await supabase
            .from('rebalance_actions')
            .update({ status: newActionStatus })
            .eq('id', action.id);
        }
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
