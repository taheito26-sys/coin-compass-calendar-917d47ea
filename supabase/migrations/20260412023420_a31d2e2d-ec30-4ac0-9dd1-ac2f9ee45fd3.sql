
-- AI Analysis Runs table
CREATE TABLE public.ai_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  context_hash text NOT NULL,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  claude_response jsonb,
  gemini_response jsonb,
  final_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('success','partial','failed','suppressed')),
  provider_latency_ms jsonb,
  error_json jsonb
);

ALTER TABLE public.ai_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analysis runs"
  ON public.ai_analysis_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own analysis runs"
  ON public.ai_analysis_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analysis runs"
  ON public.ai_analysis_runs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access analysis runs"
  ON public.ai_analysis_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_ai_analysis_runs_user_id ON public.ai_analysis_runs(user_id);
CREATE INDEX idx_ai_analysis_runs_created_at ON public.ai_analysis_runs(created_at DESC);

-- AI User Risk Profiles table
CREATE TABLE public.ai_user_risk_profiles (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  risk_style text NOT NULL DEFAULT 'balanced' CHECK (risk_style IN ('conservative','balanced','aggressive')),
  max_single_asset_weight numeric NOT NULL DEFAULT 0.35,
  rebalance_band_pct numeric NOT NULL DEFAULT 0.05,
  time_horizon text NOT NULL DEFAULT 'medium' CHECK (time_horizon IN ('short','medium','long'))
);

ALTER TABLE public.ai_user_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own risk profile"
  ON public.ai_user_risk_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own risk profile"
  ON public.ai_user_risk_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own risk profile"
  ON public.ai_user_risk_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own risk profile"
  ON public.ai_user_risk_profiles FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_risk_profiles_updated_at
  BEFORE UPDATE ON public.ai_user_risk_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
