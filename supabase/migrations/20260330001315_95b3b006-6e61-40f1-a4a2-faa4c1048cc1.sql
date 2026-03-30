-- Update transaction type constraint to allow transfer_in and transfer_out
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('buy', 'sell', 'fee', 'transfer_in', 'transfer_out'));