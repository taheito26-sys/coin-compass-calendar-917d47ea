/**
 * useRebalanceControls — Hook for user approval/rejection actions.
 */

import { useState, useCallback } from 'react';
import {
  saveRebalanceDecision,
  type ApprovalType,
  type SaveDecisionResult,
} from '../api/saveRebalanceDecision';

export interface UseRebalanceControlsReturn {
  saving: boolean;
  lastResult: SaveDecisionResult | null;
  saveReview: (runId: string) => Promise<SaveDecisionResult>;
  approveTrimsOnly: (runId: string) => Promise<SaveDecisionResult>;
  approveTrimsAndPark: (runId: string) => Promise<SaveDecisionResult>;
  approveFull: (runId: string) => Promise<SaveDecisionResult>;
  reject: (runId: string) => Promise<SaveDecisionResult>;
}

export function useRebalanceControls(): UseRebalanceControlsReturn {
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<SaveDecisionResult | null>(null);

  const execute = useCallback(async (runId: string, approval: ApprovalType) => {
    setSaving(true);
    try {
      const result = await saveRebalanceDecision(runId, approval);
      setLastResult(result);
      return result;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    saving,
    lastResult,
    saveReview: (runId: string) => execute(runId, 'save_review'),
    approveTrimsOnly: (runId: string) => execute(runId, 'approve_trims_only'),
    approveTrimsAndPark: (runId: string) => execute(runId, 'approve_trims_park'),
    approveFull: (runId: string) => execute(runId, 'approve_full'),
    reject: (runId: string) => execute(runId, 'reject'),
  };
}
