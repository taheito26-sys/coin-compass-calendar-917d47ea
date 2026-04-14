-- AI Rebalance System Extension (Idempotent Version)

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.rebalance_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid(),
    portfolio_id text,
    regime jsonb NOT NULL,
    hhi numeric NOT NULL,
    top_holding_symbol text,
    top_holding_weight numeric,
    top_cluster_name text,
    top_cluster_weight numeric,
    concentration_risk text,
    deterministic_recommendation text,
    consensus jsonb,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_signal_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid REFERENCES public.rebalance_runs(id) ON DELETE CASCADE,
    symbol text NOT NULL,
    current_weight numeric,
    target_weight numeric,
    pnl_pct_7d numeric,
    volatility_30d numeric,
    liquidity_score numeric,
    sentiment_score numeric,
    whale_activity_score numeric,
    pump_risk_score numeric,
    breadth_fit_score numeric,
    correlation_score numeric,
    concentration_score numeric,
    conviction_score numeric,
    total_score numeric,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_rebalance_opinions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid REFERENCES public.rebalance_runs(id) ON DELETE CASCADE,
    provider text NOT NULL,
    role text NOT NULL,
    verdict text,
    confidence numeric,
    payload_json jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rebalance_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid REFERENCES public.rebalance_runs(id) ON DELETE CASCADE,
    symbol text NOT NULL,
    action text NOT NULL,
    from_weight numeric,
    to_weight numeric,
    execution_mode text DEFAULT 'manual',
    status text DEFAULT 'proposed',
    reason_codes text[],
    created_at timestamptz DEFAULT now()
);

-- 2. Security
ALTER TABLE public.rebalance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_signal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rebalance_opinions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rebalance_actions ENABLE ROW LEVEL SECURITY;

-- 3. Idempotent Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own rebalance runs' AND tablename = 'rebalance_runs') THEN
        CREATE POLICY "Users can manage own rebalance runs" ON public.rebalance_runs FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own snapshots' AND tablename = 'asset_signal_snapshots') THEN
        CREATE POLICY "Users can view own snapshots" ON public.asset_signal_snapshots FOR SELECT USING (EXISTS (SELECT 1 FROM rebalance_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own opinions' AND tablename = 'ai_rebalance_opinions') THEN
        CREATE POLICY "Users can view own opinions" ON public.ai_rebalance_opinions FOR SELECT USING (EXISTS (SELECT 1 FROM rebalance_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own actions' AND tablename = 'rebalance_actions') THEN
        CREATE POLICY "Users can manage own actions" ON public.rebalance_actions FOR ALL USING (EXISTS (SELECT 1 FROM rebalance_runs r WHERE r.id = run_id AND r.user_id = auth.uid()));
    END IF;
END $$;
