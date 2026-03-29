-- User preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  UNIQUE(user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_user_prefs_user ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.user_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Import batches table
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_hash text NOT NULL,
  source_exchange text,
  source_export_type text,
  parsed_count integer DEFAULT 0,
  accepted_new_count integer DEFAULT 0,
  already_imported_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  invalid_count integer DEFAULT 0,
  conflict_count integer DEFAULT 0,
  persisted_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_user ON public.import_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_filehash ON public.import_batches(user_id, file_hash);

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own import batches"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Import rows table
CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id),
  user_id uuid NOT NULL,
  source_row_index integer NOT NULL,
  status text NOT NULL,
  message text,
  fingerprint_hash text,
  native_id text,
  canonical_json text,
  transaction_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_rows_batch ON public.import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_rows_user ON public.import_rows(user_id, created_at DESC);

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own import rows"
  ON public.import_rows
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Import fingerprints table
CREATE TABLE IF NOT EXISTS public.import_row_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fingerprint_hash text NOT NULL,
  native_id text,
  source_exchange text,
  source_export_type text,
  canonical_json text,
  transaction_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, fingerprint_hash)
);
CREATE INDEX IF NOT EXISTS idx_import_fp_user_native ON public.import_row_fingerprints(user_id, native_id);

ALTER TABLE public.import_row_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own fingerprints"
  ON public.import_row_fingerprints
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add unique constraint on transactions for dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_user_external_id ON public.transactions(user_id, external_id) WHERE external_id IS NOT NULL;

-- Add RLS policies for imported_files delete
CREATE POLICY "Users can delete own imported files"
  ON public.imported_files
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add RLS policies for imported_files update
CREATE POLICY "Users can update own imported files"
  ON public.imported_files
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure assets table allows inserts for authenticated users
CREATE POLICY "Authenticated users can insert assets"
  ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);