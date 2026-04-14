/**
 * useRebalanceAnalysis — React hook for running rebalance analysis.
 *
 * Connects the portfolio data to the rebalance analysis pipeline.
 */

import { useState, useCallback } from 'react';
import { useUnifiedPortfolio } from '@/hooks/useUnifiedPortfolio';
import { useLivePrices } from '@/hooks/useLivePrices';
import {
  getRebalanceAnalysis,
  buildSignalInputs,
  type RebalanceAnalysisResult,
} from '../api/getRebalanceAnalysis';
import type { RiskGuardConfig } from '../types/rebalance';
import { DEFAULT_RISK_GUARD_CONFIG } from '../types/rebalance';

export interface UseRebalanceAnalysisReturn {
  result: RebalanceAnalysisResult | null;
  loading: boolean;
  error: string | null;
  runAnalysis: (options?: { skipAI?: boolean; config?: RiskGuardConfig }) => Promise<void>;
  clear: () => void;
}

export function useRebalanceAnalysis(): UseRebalanceAnalysisReturn {
  const portfolio = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const [result, setResult] = useState<RebalanceAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async (options?: {
    skipAI?: boolean;
    config?: RiskGuardConfig;
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Build signal inputs from live portfolio
      const positions = portfolio.positions.map(p => {
        const live = getPrice(p.sym);
        return {
          sym: p.sym,
          qty: p.qty,
          price: live?.current_price ?? p.price ?? null,
          cost: p.cost,
          avg: p.avg,
          change1h: live?.price_change_percentage_1h_in_currency ?? 0,
          change24h: live?.price_change_percentage_24h_in_currency ?? 0,
          change7d: live?.price_change_percentage_7d_in_currency ?? 0,
          marketCap: live?.market_cap ?? 0,
          volume: live?.total_volume ?? 0,
        };
      });

      const totalMV = positions.reduce((s, p) => {
        return s + (p.price !== null ? (p.price || 0) * p.qty : 0);
      }, 0);

      const signalInputs = buildSignalInputs(positions, totalMV);

      if (signalInputs.length === 0) {
        setError('No valid positions for analysis');
        setLoading(false);
        return;
      }

      const analysisResult = await getRebalanceAnalysis(
        signalInputs,
        options?.config || DEFAULT_RISK_GUARD_CONFIG,
        { skipAI: options?.skipAI },
      );

      setResult(analysisResult);

      if (analysisResult.errors.length > 0) {
        console.warn('[useRebalanceAnalysis] Non-fatal errors:', analysisResult.errors);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('[useRebalanceAnalysis] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [portfolio.positions, getPrice]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, runAnalysis, clear };
}
