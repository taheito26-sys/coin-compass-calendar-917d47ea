CREATE TABLE IF NOT EXISTS public.lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  remaining_qty NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  acquired_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT lots_status_check CHECK (status IN ('open', 'consumed'))
);

CREATE INDEX IF NOT EXISTS idx_lots_user_asset_status ON public.lots (user_id, asset_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_transaction_id ON public.lots (transaction_id);

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Users can view their own lots'
  ) THEN
    CREATE POLICY "Users can view their own lots"
    ON public.lots
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Users can create their own lots'
  ) THEN
    CREATE POLICY "Users can create their own lots"
    ON public.lots
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Users can update their own lots'
  ) THEN
    CREATE POLICY "Users can update their own lots"
    ON public.lots
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Users can delete their own lots'
  ) THEN
    CREATE POLICY "Users can delete their own lots"
    ON public.lots
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  total_market_value NUMERIC NOT NULL DEFAULT 0,
  total_cost_basis NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON public.portfolio_snapshots (user_id, date DESC);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'Users can view their own portfolio snapshots'
  ) THEN
    CREATE POLICY "Users can view their own portfolio snapshots"
    ON public.portfolio_snapshots
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'Users can create their own portfolio snapshots'
  ) THEN
    CREATE POLICY "Users can create their own portfolio snapshots"
    ON public.portfolio_snapshots
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'Users can update their own portfolio snapshots'
  ) THEN
    CREATE POLICY "Users can update their own portfolio snapshots"
    ON public.portfolio_snapshots
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portfolio_snapshots' AND policyname = 'Users can delete their own portfolio snapshots'
  ) THEN
    CREATE POLICY "Users can delete their own portfolio snapshots"
    ON public.portfolio_snapshots
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.position_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_snapshot_id UUID NOT NULL REFERENCES public.portfolio_snapshots(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  market_price NUMERIC NOT NULL DEFAULT 0,
  market_value NUMERIC NOT NULL DEFAULT 0,
  cost_basis NUMERIC NOT NULL DEFAULT 0,
  avg_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (portfolio_snapshot_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_position_snapshots_snapshot ON public.position_snapshots (portfolio_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_position_snapshots_asset ON public.position_snapshots (asset_id);

ALTER TABLE public.position_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'position_snapshots' AND policyname = 'Users can view their own position snapshots'
  ) THEN
    CREATE POLICY "Users can view their own position snapshots"
    ON public.position_snapshots
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.portfolio_snapshots ps
        WHERE ps.id = portfolio_snapshot_id
          AND ps.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'position_snapshots' AND policyname = 'Users can create their own position snapshots'
  ) THEN
    CREATE POLICY "Users can create their own position snapshots"
    ON public.position_snapshots
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.portfolio_snapshots ps
        WHERE ps.id = portfolio_snapshot_id
          AND ps.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'position_snapshots' AND policyname = 'Users can update their own position snapshots'
  ) THEN
    CREATE POLICY "Users can update their own position snapshots"
    ON public.position_snapshots
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1
        FROM public.portfolio_snapshots ps
        WHERE ps.id = portfolio_snapshot_id
          AND ps.user_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.portfolio_snapshots ps
        WHERE ps.id = portfolio_snapshot_id
          AND ps.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'position_snapshots' AND policyname = 'Users can delete their own position snapshots'
  ) THEN
    CREATE POLICY "Users can delete their own position snapshots"
    ON public.position_snapshots
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1
        FROM public.portfolio_snapshots ps
        WHERE ps.id = portfolio_snapshot_id
          AND ps.user_id = auth.uid()
      )
    );
  END IF;
END $$;