/*
  # AI-Assisted Portfolio Rebalancing Schema

  Tables for the rebalance analysis workflow:
  1. rebalance_runs — top-level run tracking
  2. asset_signal_snapshots — per-asset scoring snapshots
  3. ai_rebalance_opinions — Claude/Gemini review outputs
  4. rebalance_actions — individual proposed/approved actions

  Security: RLS enabled, users can only access their own data.
*/

-- ─── rebalance_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rebalance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  portfolio_id uuid,
  regime text NOT NULL CHECK (regime IN ('risk_on', 'neutral', 'risk_off')),
  hhi numeric NOT NULL DEFAULT 0,
  top_holding_weight numeric NOT NULL DEFAULT 0,
  top_cluster_weight numeric NOT NULL DEFAULT 0,
  concentration_risk text NOT NULL DEFAULT 'low' CHECK (concentration_risk IN ('low', 'medium', 'high', 'critical')),
  deterministic_recommendation jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'analysis_complete', 'ai_review_complete',
    'approved_trims_only', 'approved_trims_park', 'approved_full',
    'rejected', 'expired'
  )),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rebalance_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rebalance runs"
  ON rebalance_runs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rebalance runs"
  ON rebalance_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rebalance runs"
  ON rebalance_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rebalance_runs_user_id ON rebalance_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_rebalance_runs_created_at ON rebalance_runs(created_at DESC);

-- ─── asset_signal_snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES rebalance_runs(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  weight numeric NOT NULL DEFAULT 0,
  pnl_pct numeric NOT NULL DEFAULT 0,
  volatility_7d numeric NOT NULL DEFAULT 0,
  volatility_30d numeric NOT NULL DEFAULT 0,
  liquidity_score numeric NOT NULL DEFAULT 0,
  sentiment_score numeric NOT NULL DEFAULT 0,
  whale_score numeric NOT NULL DEFAULT 0,
  pump_risk_score numeric NOT NULL DEFAULT 0,
  breadth_fit_score numeric NOT NULL DEFAULT 0,
  correlation_penalty numeric NOT NULL DEFAULT 0,
  concentration_penalty numeric NOT NULL DEFAULT 0,
  conviction_score numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE asset_signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own asset snapshots"
  ON asset_signal_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = asset_signal_snapshots.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own asset snapshots"
  ON asset_signal_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = asset_signal_snapshots.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_asset_signal_snapshots_run_id ON asset_signal_snapshots(run_id);

-- ─── ai_rebalance_opinions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_rebalance_opinions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES rebalance_runs(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('claude', 'gemini', 'deterministic')),
  role text NOT NULL,
  verdict text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_rebalance_opinions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai opinions"
  ON ai_rebalance_opinions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = ai_rebalance_opinions.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ai opinions"
  ON ai_rebalance_opinions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = ai_rebalance_opinions.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_rebalance_opinions_run_id ON ai_rebalance_opinions(run_id);

-- ─── rebalance_actions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rebalance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES rebalance_runs(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  action text NOT NULL CHECK (action IN ('trim', 'hold', 'park_usdt', 'replace_candidate_review', 'no_action')),
  from_weight numeric,
  to_weight numeric,
  execution_mode text NOT NULL DEFAULT 'manual' CHECK (execution_mode IN ('manual', 'auto')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executed')),
  reason_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rebalance_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rebalance actions"
  ON rebalance_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = rebalance_actions.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own rebalance actions"
  ON rebalance_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = rebalance_actions.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own rebalance actions"
  ON rebalance_actions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = rebalance_actions.run_id
      AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rebalance_runs r
      WHERE r.id = rebalance_actions.run_id
      AND r.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_rebalance_actions_run_id ON rebalance_actions(run_id);
CREATE INDEX IF NOT EXISTS idx_rebalance_actions_status ON rebalance_actions(status);
