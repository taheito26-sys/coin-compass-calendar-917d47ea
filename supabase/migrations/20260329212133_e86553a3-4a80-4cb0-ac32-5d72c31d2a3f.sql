
-- Exchange connections table: stores API credentials for exchange sync
CREATE TABLE public.exchange_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  passphrase TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  last_sync TIMESTAMP WITH TIME ZONE,
  sync_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);

-- Enable RLS
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own connections
CREATE POLICY "Users can manage own exchange connections"
  ON public.exchange_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
