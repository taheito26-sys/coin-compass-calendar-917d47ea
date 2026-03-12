import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/profit-share?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ deals: [] });
  const relId = c.req.query('relationship_id');

  let q: string, binds: unknown[];
  if (relId) {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'profit_share' AND d.relationship_id = ? AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [relId, merchant.id, merchant.id];
  } else {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'profit_share' AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [merchant.id, merchant.id];
  }
  const { results } = await c.env.DB.prepare(q).bind(...binds).all();

  // Enrich with allocations and funding lines
  const deals = [];
  for (const deal of (results || [])) {
    const { results: allocs } = await c.env.DB.prepare(
      'SELECT * FROM merchant_profit_allocations WHERE deal_id = ? ORDER BY created_at DESC'
    ).bind((deal as any).id).all();
    const { results: lines } = await c.env.DB.prepare(
      'SELECT * FROM merchant_deal_funding_lines WHERE deal_id = ? ORDER BY created_at ASC'
    ).bind((deal as any).id).all();
    deals.push({ ...deal, allocations: allocs || [], funding_lines: lines || [] });
  }

  return c.json({ deals });
});

/** POST /api/merchant/profit-share — create profit-share deal */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string; title: string; capital_amount: number; currency?: string;
    owner_ratio: number; operator_ratio: number; loss_policy?: string;
    principal_guarantee?: boolean; due_date?: string;
  }>();

  if (!body.relationship_id || !body.title || !body.capital_amount || body.owner_ratio == null) {
    return c.json({ error: 'relationship_id, title, capital_amount, owner_ratio required' }, 400);
  }

  const access = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(body.relationship_id, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Relationship not found or inactive' }, 403);

  const now = new Date().toISOString();
  const dealId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, metadata, due_date, expected_return, created_by, created_at, updated_at)
    VALUES (?, ?, 'profit_share', ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
  `).bind(dealId, body.relationship_id, body.title, body.capital_amount,
    body.currency || 'USDT',
    JSON.stringify({
      owner_ratio: body.owner_ratio, operator_ratio: body.operator_ratio,
      loss_policy: body.loss_policy || 'operator_bears_all',
      principal_guarantee: body.principal_guarantee ?? true,
    }),
    body.due_date || null, null, merchant.id, now, now).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'create', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, dealId, now).run();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first();
  return c.json({ deal }, 201);
});

/** POST /api/merchant/profit-share/:id/allocate — submit profit allocation */
app.post('/:id/allocate', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    gross_proceeds: number; cost_basis: number; network_fees?: number;
    transfer_fees?: number; deal_expenses?: number; approved_corrections?: number;
  }>();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const meta = JSON.parse(deal.metadata || '{}');
  const netProfit = body.gross_proceeds - body.cost_basis - (body.network_fees || 0) -
    (body.transfer_fees || 0) - (body.deal_expenses || 0) - (body.approved_corrections || 0);
  const ownerShare = netProfit * (meta.owner_ratio || 0.6);
  const operatorShare = netProfit * (meta.operator_ratio || 0.4);

  const now = new Date().toISOString();
  const allocId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_profit_allocations (id, deal_id, relationship_id, gross_proceeds, cost_basis, network_fees, transfer_fees, deal_expenses, approved_corrections, net_deal_profit, owner_ratio, operator_ratio, owner_share, operator_share, status, submitted_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).bind(allocId, dealId, deal.relationship_id,
    body.gross_proceeds, body.cost_basis, body.network_fees || 0,
    body.transfer_fees || 0, body.deal_expenses || 0, body.approved_corrections || 0,
    netProfit, meta.owner_ratio || 0.6, meta.operator_ratio || 0.4,
    ownerShare, operatorShare, merchant.id, now, now).run();

  // Create approval
  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'profit_allocation', 'profit_allocation', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, allocId,
    JSON.stringify({ net_profit: netProfit, owner_share: ownerShare, operator_share: operatorShare }),
    userId, merchant.id, now).run();

  return c.json({ allocation_id: allocId, approval_id: approvalId }, 201);
});

export default app;
