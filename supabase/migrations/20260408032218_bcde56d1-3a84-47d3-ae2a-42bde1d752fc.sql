
CREATE TABLE public.sentiment_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sentiment_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sentiment cache is publicly readable"
  ON public.sentiment_cache FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage sentiment cache"
  ON public.sentiment_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
