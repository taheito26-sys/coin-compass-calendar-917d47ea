
-- Source Credibility Scoring Engine
CREATE TABLE public.source_reliability (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'unknown',
  verification_method text,
  historical_accuracy integer NOT NULL DEFAULT 50,
  latency_score integer NOT NULL DEFAULT 50,
  trust_score integer NOT NULL DEFAULT 20,
  false_signal_count integer NOT NULL DEFAULT 0,
  total_signal_count integer NOT NULL DEFAULT 0,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT source_reliability_name_unique UNIQUE (source_name)
);

ALTER TABLE public.source_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Source reliability is publicly readable"
  ON public.source_reliability FOR SELECT USING (true);

CREATE POLICY "Service role can manage source reliability"
  ON public.source_reliability FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Rumor vs Official Source Classifier
CREATE TABLE public.event_classification (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL,
  classification text NOT NULL DEFAULT 'RUMOR',
  confidence integer NOT NULL DEFAULT 50,
  source_id uuid REFERENCES public.source_reliability(id),
  reasoning text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_classification_event_unique UNIQUE (event_id)
);

ALTER TABLE public.event_classification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event classifications are publicly readable"
  ON public.event_classification FOR SELECT USING (true);

CREATE POLICY "Service role can manage event classifications"
  ON public.event_classification FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Unified Risk Signal Aggregator
CREATE TABLE public.risk_signal_aggregate (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_symbol text NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'LOW',
  signal_count integer NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT risk_signal_token_unique UNIQUE (token_symbol)
);

ALTER TABLE public.risk_signal_aggregate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Risk signals are publicly readable"
  ON public.risk_signal_aggregate FOR SELECT USING (true);

CREATE POLICY "Service role can manage risk signals"
  ON public.risk_signal_aggregate FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_event_classification_event_id ON public.event_classification(event_id);
CREATE INDEX idx_risk_signal_token ON public.risk_signal_aggregate(token_symbol);
CREATE INDEX idx_source_reliability_type ON public.source_reliability(source_type);
