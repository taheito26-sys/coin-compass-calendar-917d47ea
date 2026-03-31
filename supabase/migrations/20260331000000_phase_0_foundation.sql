-- Phase 0: Foundation Schema Evolution

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'exchange', 'wallet', 'manual'
  venue TEXT, -- 'Binance', 'Coinbase', 'MetaMask', etc.
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Create wallets table (linked to accounts)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain TEXT NOT NULL, -- 'ETH', 'SOL', 'BTC', etc.
  xpub TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, address, chain)
);

-- Add account_id to transactions if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'transactions' AND COLUMN_NAME = 'account_id') THEN
    ALTER TABLE transactions ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create lots table for deterministic accounting
CREATE TABLE IF NOT EXISTS lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL,
  remaining_qty NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'consumed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create price_history table
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT,
  UNIQUE(asset_id, timestamp)
);

-- Create portfolio_snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_market_value NUMERIC NOT NULL,
  total_cost_basis NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL,
  unrealized_pnl NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Create position_snapshots table
CREATE TABLE IF NOT EXISTS position_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_snapshot_id UUID NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL,
  market_price NUMERIC NOT NULL,
  market_value NUMERIC NOT NULL,
  cost_basis NUMERIC NOT NULL,
  avg_cost NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_snapshot_id, asset_id)
);

-- Update exchange_connections to link with accounts (optional but helpful)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'exchange_connections' AND COLUMN_NAME = 'account_id') THEN
    ALTER TABLE exchange_connections ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_lots_asset_id_status ON lots(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_user_id ON lots(user_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date ON portfolio_snapshots(user_id, date);
CREATE INDEX IF NOT EXISTS idx_position_snapshots_portfolio_id ON position_snapshots(portfolio_snapshot_id);

-- Enable RLS on new tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_snapshots ENABLE ROW LEVEL SECURITY;

-- Simple RLS Policies (User only sees their own data)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own accounts') THEN
    CREATE POLICY "Users can view their own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own wallets') THEN
    CREATE POLICY "Users can view their own wallets" ON wallets FOR ALL USING (account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own lots') THEN
    CREATE POLICY "Users can view their own lots" ON lots FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view price history') THEN
    CREATE POLICY "Anyone can view price history" ON price_history FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own snapshots') THEN
    CREATE POLICY "Users can view their own snapshots" ON portfolio_snapshots FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own position snapshots') THEN
    CREATE POLICY "Users can view their own position snapshots" ON position_snapshots FOR ALL USING (portfolio_snapshot_id IN (SELECT id FROM portfolio_snapshots WHERE user_id = auth.uid()));
  END IF;
END $$;
