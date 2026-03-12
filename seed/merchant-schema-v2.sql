-- ============================================================
-- Merchant Platform Schema v2 — Full Lending & Profit-Sharing System
-- Run AFTER merchant-schema.sql (extends existing tables)
-- ============================================================

-- Relationship Terms — stores default ratios, policies, allowed deal classes per relationship
CREATE TABLE IF NOT EXISTS merchant_relationship_terms (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id) ON DELETE CASCADE,
  default_owner_ratio REAL DEFAULT 0.6,
  default_operator_ratio REAL DEFAULT 0.4,
  loss_policy TEXT NOT NULL DEFAULT 'operator_bears_all',  -- operator_bears_all|shared_ratio|capped_principal|no_profit_until_recovered
  settlement_cycle TEXT NOT NULL DEFAULT 'monthly',        -- weekly|biweekly|monthly|quarterly|on_demand
  allowed_currencies TEXT DEFAULT '["USDT","QAR"]',        -- JSON array
  allowed_deal_classes TEXT DEFAULT '["advance","purchase","profit_share","capital_pool"]', -- JSON array
  advances_enabled INTEGER NOT NULL DEFAULT 1,
  purchases_enabled INTEGER NOT NULL DEFAULT 1,
  profit_share_enabled INTEGER NOT NULL DEFAULT 1,
  capital_pools_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rt_rel ON merchant_relationship_terms(relationship_id);

-- Deal Funding Lines — tracks each capital movement within a deal
CREATE TABLE IF NOT EXISTS merchant_deal_funding_lines (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL,                      -- principal_sent|principal_returned|fee_charged|profit_paid|adjustment
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  usdt_qty REAL,
  unit_rate REAL,                               -- e.g. QAR per USDT
  base_amount REAL,                             -- amount in reporting currency
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT,
  transfer_reference TEXT,
  source_wallet TEXT,
  destination_wallet TEXT,
  creator_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  confirmer_merchant_id TEXT,
  confirmed_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dfl_deal ON merchant_deal_funding_lines(deal_id);

-- Profit Allocations — per-deal profit split records (replaces generic profit_records for profit-share deals)
CREATE TABLE IF NOT EXISTS merchant_profit_allocations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id) ON DELETE CASCADE,
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  gross_proceeds REAL NOT NULL DEFAULT 0,
  cost_basis REAL NOT NULL DEFAULT 0,
  network_fees REAL NOT NULL DEFAULT 0,
  transfer_fees REAL NOT NULL DEFAULT 0,
  deal_expenses REAL NOT NULL DEFAULT 0,
  approved_corrections REAL NOT NULL DEFAULT 0,
  net_deal_profit REAL NOT NULL DEFAULT 0,      -- computed: gross - cost - fees - expenses - corrections
  owner_ratio REAL NOT NULL,
  operator_ratio REAL NOT NULL,
  owner_share REAL NOT NULL DEFAULT 0,
  operator_share REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending|approved|disputed|settled
  submitted_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pa_deal ON merchant_profit_allocations(deal_id);

-- Capital Pool Accounts — managed monthly pools
CREATE TABLE IF NOT EXISTS merchant_pool_accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  capital_owner_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  operator_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  initial_capital REAL NOT NULL DEFAULT 0,
  current_capital REAL NOT NULL DEFAULT 0,
  minimum_reserve REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDT',
  profit_split_owner REAL NOT NULL DEFAULT 0.6,
  profit_split_operator REAL NOT NULL DEFAULT 0.4,
  loss_carry_forward REAL NOT NULL DEFAULT 0,
  high_water_mark REAL NOT NULL DEFAULT 0,
  payout_cycle TEXT NOT NULL DEFAULT 'monthly',  -- monthly|quarterly
  settlement_cutoff_day INTEGER NOT NULL DEFAULT 28,
  status TEXT NOT NULL DEFAULT 'active',          -- active|paused|closed
  start_date TEXT NOT NULL,
  close_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pool_rel ON merchant_pool_accounts(relationship_id);

-- Pool Periods — monthly/quarterly period snapshots
CREATE TABLE IF NOT EXISTS merchant_pool_periods (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pool_id TEXT NOT NULL REFERENCES merchant_pool_accounts(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,                    -- e.g. "2025-03"
  opening_capital REAL NOT NULL DEFAULT 0,
  top_ups REAL NOT NULL DEFAULT 0,
  withdrawals REAL NOT NULL DEFAULT 0,
  closing_capital REAL NOT NULL DEFAULT 0,
  realized_profit REAL NOT NULL DEFAULT 0,
  carried_loss_recovered REAL NOT NULL DEFAULT 0,
  pool_fees REAL NOT NULL DEFAULT 0,
  distributable_profit REAL NOT NULL DEFAULT 0,
  owner_payout REAL NOT NULL DEFAULT 0,
  operator_payout REAL NOT NULL DEFAULT 0,
  loss_carry_forward REAL NOT NULL DEFAULT 0,
  effective_yield REAL,                          -- percentage
  status TEXT NOT NULL DEFAULT 'open',           -- open|locked|settled
  locked_at TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pp_pool ON merchant_pool_periods(pool_id, period_label);

-- Deal Comments / Thread — per-deal communication
CREATE TABLE IF NOT EXISTS merchant_comments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  parent_id TEXT REFERENCES merchant_comments(id),
  sender_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  sender_user_id TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'normal',   -- normal|query|correction_request|payment_reminder|settlement_confirmation|dispute
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cmt_deal ON merchant_comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_cmt_rel ON merchant_comments(relationship_id);

-- Adjustments / Corrections — immutable correction records
CREATE TABLE IF NOT EXISTS merchant_adjustments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  requester_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  field_challenged TEXT NOT NULL,
  old_value TEXT,
  proposed_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending|approved|rejected
  approver_merchant_id TEXT,
  approved_adjustment_value TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adj_deal ON merchant_adjustments(deal_id);

-- Balance Snapshots — point-in-time balance records per relationship
CREATE TABLE IF NOT EXISTS merchant_balance_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  snapshot_date TEXT NOT NULL,
  advance_receivable REAL NOT NULL DEFAULT 0,
  trade_receivable REAL NOT NULL DEFAULT 0,
  profit_share_receivable REAL NOT NULL DEFAULT 0,
  pool_capital_receivable REAL NOT NULL DEFAULT 0,
  fee_receivable REAL NOT NULL DEFAULT 0,
  total_payable REAL NOT NULL DEFAULT 0,
  net_position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bs_rel ON merchant_balance_snapshots(relationship_id, snapshot_date);

-- Extend merchant_deals with new columns for v2 deal classes
-- (D1 doesn't support ADD COLUMN IF NOT EXISTS, so we use a helper approach)
-- These columns may already exist — run individually and ignore errors

-- deal_class: advance|purchase|profit_share|capital_pool (more specific than deal_type)
-- principal_amount, principal_returned, cost_basis, sale_rate, sale_proceeds
-- owner_ratio, operator_ratio, loss_policy, principal_guarantee
-- For v2, the metadata JSON column stores extended fields

-- Merchant profile extensions for v2 onboarding
-- operating_mode: capital_owner|operator|both
-- accept_funded_deals, accept_managed_pools, default_profit_template, default_settlement_cycle
