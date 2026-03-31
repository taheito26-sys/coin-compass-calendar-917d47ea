
CREATE TABLE public.whale_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blockchain text NOT NULL,
  symbol text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  amount_usd numeric NOT NULL DEFAULT 0,
  from_address text NOT NULL DEFAULT 'Unknown',
  to_address text NOT NULL DEFAULT 'Unknown',
  tx_hash text,
  transaction_type text NOT NULL DEFAULT 'transfer',
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_whale_cache_detected_at ON public.whale_cache (detected_at DESC);
CREATE INDEX idx_whale_cache_blockchain ON public.whale_cache (blockchain);

ALTER TABLE public.whale_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Whale cache is publicly readable"
  ON public.whale_cache FOR SELECT TO public
  USING (true);

CREATE POLICY "Service role can manage whale cache"
  ON public.whale_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
