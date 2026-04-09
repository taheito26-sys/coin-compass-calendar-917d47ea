
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  date date NOT NULL,
  close_price numeric NOT NULL,
  source text NOT NULL DEFAULT 'snapshot',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, date)
);

CREATE INDEX idx_price_history_asset_date ON public.price_history (asset_id, date);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Price history is publicly readable"
  ON public.price_history FOR SELECT TO public
  USING (true);

CREATE POLICY "Service role can manage price history"
  ON public.price_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Backfill from existing position_snapshots
INSERT INTO public.price_history (asset_id, date, close_price, source)
SELECT DISTINCT ps2.asset_id, snap.date, ps2.market_price, 'backfill'
FROM position_snapshots ps2
JOIN portfolio_snapshots snap ON snap.id = ps2.portfolio_snapshot_id
WHERE ps2.market_price > 0
ON CONFLICT (asset_id, date) DO NOTHING;
