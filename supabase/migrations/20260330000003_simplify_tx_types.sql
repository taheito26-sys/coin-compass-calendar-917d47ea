
-- Simplify transaction types by removing transfer_in, transfer_out, reward, and adjustment.

-- First, delete existing transactions of these types to ensure the new constraint applies
-- (Or we could re-categorize them, but "remove from tracker" implies they're gone)
DELETE FROM public.transactions 
  WHERE type IN ('transfer_in', 'transfer_out', 'reward', 'adjustment');

-- Drop the old constraint. We need to find the name. 
-- Usually it's transactions_type_check if not specified, 
-- but in our migration it was inline. In Postgres, the name is usually generated.
-- We can search for it via information_schema or just try standard naming.

-- To be safe, we use a block to find and drop it if we knew the name, 
-- but since we're in a migration script we can just recreate the table or use:
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add the new strict constraint (Buy, Sell, and Fee for internal use)
ALTER TABLE public.transactions 
  ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('buy', 'sell', 'fee'));
