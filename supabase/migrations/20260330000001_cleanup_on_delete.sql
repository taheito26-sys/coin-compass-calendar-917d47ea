
-- Fix foreign key relation for import_row_fingerprints to allow automatic cleanup on transaction deletion
ALTER TABLE public.import_row_fingerprints 
  ALTER COLUMN transaction_id TYPE uuid USING (transaction_id::uuid);

ALTER TABLE public.import_row_fingerprints
  ADD CONSTRAINT import_row_fingerprints_transaction_id_fkey 
  FOREIGN KEY (transaction_id) 
  REFERENCES public.transactions(id) 
  ON DELETE CASCADE;

-- Ensure RLS allows users to clear their own import batches
DROP POLICY IF EXISTS "Users can manage own import batches" ON public.import_batches;
CREATE POLICY "Users can manage own import batches"
  ON public.import_batches
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Explicitly allow deletion from import_row_fingerprints if not already covered
DROP POLICY IF EXISTS "Users can manage own fingerprints" ON public.import_row_fingerprints;
CREATE POLICY "Users can manage own fingerprints"
  ON public.import_row_fingerprints
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
