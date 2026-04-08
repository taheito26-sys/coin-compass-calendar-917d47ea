
-- Listing sources registry
CREATE TABLE IF NOT EXISTS public.listing_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  priority integer NOT NULL DEFAULT 50,
  base_url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.listing_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listing sources are publicly readable" ON public.listing_sources FOR SELECT USING (true);

-- Listing events (core normalized events table)
CREATE TABLE IF NOT EXISTS public.listing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_symbol text NOT NULL,
  token_name text,
  contract_address text,
  chain text,
  exchange text NOT NULL,
  pair text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'announced',
  source_url text,
  announcement_time timestamp with time zone,
  detected_time timestamp with time zone NOT NULL DEFAULT now(),
  confidence_score integer NOT NULL DEFAULT 0,
  lead_time_minutes integer,
  raw_payload text,
  dedup_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.listing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listing events are publicly readable" ON public.listing_events FOR SELECT USING (true);
CREATE POLICY "Service role can manage listing events" ON public.listing_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_listing_events_symbol ON public.listing_events (token_symbol);
CREATE INDEX idx_listing_events_type ON public.listing_events (event_type);
CREATE INDEX idx_listing_events_detected ON public.listing_events (detected_time DESC);
CREATE UNIQUE INDEX idx_listing_events_dedup ON public.listing_events (dedup_hash);

-- Airdrop projects
CREATE TABLE IF NOT EXISTS public.airdrop_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL,
  token_symbol text,
  chain text,
  official_url text,
  snapshot_date timestamp with time zone,
  distribution_date timestamp with time zone,
  eligibility_requirements text,
  confidence_score integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.airdrop_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Airdrop projects are publicly readable" ON public.airdrop_projects FOR SELECT USING (true);
CREATE POLICY "Service role can manage airdrop projects" ON public.airdrop_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Airdrop tasks
CREATE TABLE IF NOT EXISTS public.airdrop_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.airdrop_projects(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  description text NOT NULL,
  deadline timestamp with time zone,
  required boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.airdrop_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Airdrop tasks are publicly readable" ON public.airdrop_tasks FOR SELECT USING (true);
CREATE POLICY "Service role can manage airdrop tasks" ON public.airdrop_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- User airdrop progress (user-scoped)
CREATE TABLE IF NOT EXISTS public.user_airdrop_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.airdrop_tasks(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  UNIQUE(user_id, task_id)
);
ALTER TABLE public.user_airdrop_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own airdrop progress" ON public.user_airdrop_progress FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own airdrop progress" ON public.user_airdrop_progress FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Token risk flags
CREATE TABLE IF NOT EXISTS public.token_risk_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_symbol text NOT NULL,
  flag_type text NOT NULL,
  description text,
  severity integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.token_risk_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Token risk flags are publicly readable" ON public.token_risk_flags FOR SELECT USING (true);
CREATE POLICY "Service role can manage token risk flags" ON public.token_risk_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
