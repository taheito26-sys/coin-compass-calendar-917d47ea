
-- Enable pg_cron and pg_net for scheduled edge function invocation
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Sync logs table for audit trail
CREATE TABLE public.exchange_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exchange TEXT NOT NULL,
  synced_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exchange_sync_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own sync logs
CREATE POLICY "Users can view own sync logs"
  ON public.exchange_sync_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert (for cron function)
CREATE POLICY "Service role can insert sync logs"
  ON public.exchange_sync_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);
