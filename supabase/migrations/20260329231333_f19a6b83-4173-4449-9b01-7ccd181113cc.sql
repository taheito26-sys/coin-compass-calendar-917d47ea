-- Clean up deprecated transaction types
DELETE FROM transactions WHERE type IN ('transfer_in', 'transfer_out', 'reward', 'adjustment');

-- Drop existing constraint if any
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add strict constraint allowing only buy, sell, fee
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('buy', 'sell', 'fee'));