import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/terms/:relationshipId */
app.get('/:relationshipId', async (c) => {
  const relId = c.req.param('relationshipId');
  const row = await c.env.DB.prepare(
    'SELECT * FROM merchant_relationship_terms WHERE relationship_id = ?'
  ).bind(relId).first();
  return c.json({ terms: row || null });
});

/** PUT /api/merchant/terms/:relationshipId */
app.put('/:relationshipId', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('relationshipId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    default_owner_ratio?: number; default_operator_ratio?: number;
    loss_policy?: string; settlement_cycle?: string;
    allowed_currencies?: string[]; allowed_deal_classes?: string[];
    advances_enabled?: boolean; purchases_enabled?: boolean;
    profit_share_enabled?: boolean; capital_pools_enabled?: boolean;
  }>();

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    'SELECT id FROM merchant_relationship_terms WHERE relationship_id = ?'
  ).bind(relId).first();

  if (existing) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    const FIELDS: Record<string, (v: any) => unknown> = {
      default_owner_ratio: v => Number(v),
      default_operator_ratio: v => Number(v),
      loss_policy: v => String(v),
      settlement_cycle: v => String(v),
      allowed_currencies: v => JSON.stringify(v),
      allowed_deal_classes: v => JSON.stringify(v),
      advances_enabled: v => v ? 1 : 0,
      purchases_enabled: v => v ? 1 : 0,
      profit_share_enabled: v => v ? 1 : 0,
      capital_pools_enabled: v => v ? 1 : 0,
    };
    for (const [key, fn] of Object.entries(FIELDS)) {
      if (key in body) { sets.push(`${key} = ?`); vals.push(fn((body as any)[key])); }
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?'); vals.push(now); vals.push(relId);
      await c.env.DB.prepare(`UPDATE merchant_relationship_terms SET ${sets.join(', ')} WHERE relationship_id = ?`).bind(...vals).run();
    }
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO merchant_relationship_terms (id, relationship_id, default_owner_ratio, default_operator_ratio, loss_policy, settlement_cycle, allowed_currencies, allowed_deal_classes, advances_enabled, purchases_enabled, profit_share_enabled, capital_pools_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, relId,
      body.default_owner_ratio ?? 0.6, body.default_operator_ratio ?? 0.4,
      body.loss_policy || 'operator_bears_all', body.settlement_cycle || 'monthly',
      JSON.stringify(body.allowed_currencies || ['USDT', 'QAR']),
      JSON.stringify(body.allowed_deal_classes || ['advance', 'purchase', 'profit_share', 'capital_pool']),
      body.advances_enabled !== false ? 1 : 0, body.purchases_enabled !== false ? 1 : 0,
      body.profit_share_enabled !== false ? 1 : 0, body.capital_pools_enabled !== false ? 1 : 0,
      now, now).run();
  }

  const terms = await c.env.DB.prepare('SELECT * FROM merchant_relationship_terms WHERE relationship_id = ?').bind(relId).first();
  return c.json({ terms });
});

export default app;
