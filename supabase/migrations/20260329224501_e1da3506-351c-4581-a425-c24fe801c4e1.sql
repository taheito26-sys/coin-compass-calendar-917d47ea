
-- 1. Add content_hash to import_batches for idempotent file-level checks
ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS content_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_user_content_hash ON public.import_batches(user_id, content_hash);

-- 2. Add fingerprint_hash to transactions for direct uniqueness enforcement
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS fingerprint_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_fingerprint ON public.transactions(user_id, fingerprint_hash);

-- 3. Clean up invalid transaction_id values in fingerprints before type conversion
DELETE FROM public.import_row_fingerprints 
  WHERE transaction_id IS NOT NULL 
    AND transaction_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 4. Convert transaction_id to uuid type
ALTER TABLE public.import_row_fingerprints 
  ALTER COLUMN transaction_id TYPE uuid USING (transaction_id::uuid);

-- 5. Add CASCADE foreign key from fingerprints to transactions
ALTER TABLE public.import_row_fingerprints
  DROP CONSTRAINT IF EXISTS import_row_fingerprints_transaction_id_fkey;

ALTER TABLE public.import_row_fingerprints
  ADD CONSTRAINT import_row_fingerprints_transaction_id_fkey 
  FOREIGN KEY (transaction_id) 
  REFERENCES public.transactions(id) 
  ON DELETE CASCADE;
