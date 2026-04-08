
CREATE TABLE public.sentiment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_symbol text NOT NULL,
  sentiment_score integer NOT NULL DEFAULT 50,
  source text NOT NULL DEFAULT 'aggregate',
  mention_count integer NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sentiment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sentiment history is publicly readable"
  ON public.sentiment_history FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage sentiment history"
  ON public.sentiment_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_sentiment_history_symbol ON public.sentiment_history (token_symbol);
CREATE INDEX idx_sentiment_history_date ON public.sentiment_history (snapshot_date DESC);
CREATE INDEX idx_sentiment_history_symbol_date ON public.sentiment_history (token_symbol, snapshot_date DESC);
