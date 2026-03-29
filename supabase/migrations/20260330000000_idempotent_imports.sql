
-- Add content_hash to import_batches for idempotent file-level checks
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_user_content_hash ON public.import_batches(user_id, content_hash);

-- Add fingerprint_hash to transactions for direct uniqueness enforcement
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fingerprint_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_fingerprint ON public.transactions(user_id, fingerprint_hash);

-- Update existing transactions to have a fingerprint if possible? 
-- (Hard to do retroactively without re-parsing, but new ones will have it)

-- Ensure import_batches RLS is correct
DROP POLICY IF EXISTS "Users can manage own import batches" ON public.import_batches;
CREATE POLICY "Users can manage own import batches"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
