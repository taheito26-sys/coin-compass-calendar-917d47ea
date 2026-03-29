
-- Delete legacy fingerprints that don't have valid UUIDs in transaction_id (cleanup before ALTER)
DELETE FROM public.import_row_fingerprints 
  WHERE transaction_id IS NOT NULL AND transaction_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Fix column type if not already done
ALTER TABLE public.import_row_fingerprints 
  ALTER COLUMN transaction_id TYPE uuid USING (transaction_id::uuid);

-- Ensure the FOREIGN KEY exists with CASCADE
ALTER TABLE public.import_row_fingerprints
  DROP CONSTRAINT IF EXISTS import_row_fingerprints_transaction_id_fkey;

ALTER TABLE public.import_row_fingerprints
  ADD CONSTRAINT import_row_fingerprints_transaction_id_fkey 
  FOREIGN KEY (transaction_id) 
  REFERENCES public.transactions(id) 
  ON DELETE CASCADE;

-- Ensure batch deletion from imported_files CASCADE to transactions if a link exists?
-- (Actually transactions have the file_hash or batch_id?)
-- Transactions don't have batch_id directly, they are tracked via fingerprints.
