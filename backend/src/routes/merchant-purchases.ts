import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/purchases?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ purchases: [] });
  const relId = c.req.query('relationship_id');

  let q: string, binds: unknown[];
  if (relId) {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'purchase' AND d.relationship_id = ? AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [relId, merchant.id, merchant.id];
  } else {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'purchase' AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [merchant.id, merchant.id];
  }
  const { results } = await c.env.DB.prepare(q).bind(...binds).all();
  return c.json({ purchases: results || [] });
});

/** POST /api/merchant/purchases — create purchase/sale deal */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string; title: string; usdt_qty: number; sale_rate: number;
    cost_basis?: number; currency?: string; due_date?: string; payment_method?: string;
  }>();

  if (!body.relationship_id || !body.title || !body.usdt_qty || !body.sale_rate) {
    return c.json({ error: 'relationship_id, title, usdt_qty, sale_rate required' }, 400);
  }

  const access = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(body.relationship_id, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Relationship not found or inactive' }, 403);

  const now = new Date().toISOString();
  const dealId = crypto.randomUUID();
  const saleProceeds = body.usdt_qty * body.sale_rate;
  const saleMargin = body.cost_basis ? saleProceeds - body.cost_basis : null;

  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, metadata, due_date, created_by, created_at, updated_at)
    VALUES (?, ?, 'purchase', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(dealId, body.relationship_id, body.title, saleProceeds,
    body.currency || 'USDT',
    JSON.stringify({
      usdt_qty: body.usdt_qty, sale_rate: body.sale_rate, cost_basis: body.cost_basis || null,
      sale_proceeds: saleProceeds, sale_margin: saleMargin, payment_method: body.payment_method || null,
    }),
    body.due_date || null, merchant.id, now, now).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'create', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, dealId, now).run();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first();
  return c.json({ purchase: deal }, 201);
});

export default app;
