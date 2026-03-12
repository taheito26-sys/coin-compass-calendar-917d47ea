import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/pools?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ pools: [] });
  const relId = c.req.query('relationship_id');

  let q: string, binds: unknown[];
  if (relId) {
    q = `SELECT p.* FROM merchant_pool_accounts p WHERE p.relationship_id = ? AND (p.capital_owner_id = ? OR p.operator_id = ?) ORDER BY p.created_at DESC`;
    binds = [relId, merchant.id, merchant.id];
  } else {
    q = `SELECT p.* FROM merchant_pool_accounts p WHERE (p.capital_owner_id = ? OR p.operator_id = ?) ORDER BY p.created_at DESC`;
    binds = [merchant.id, merchant.id];
  }
  const { results } = await c.env.DB.prepare(q).bind(...binds).all();

  // Enrich with periods
  const pools = [];
  for (const pool of (results || [])) {
    const { results: periods } = await c.env.DB.prepare(
      'SELECT * FROM merchant_pool_periods WHERE pool_id = ? ORDER BY period_label DESC LIMIT 12'
    ).bind((pool as any).id).all();
    pools.push({ ...pool, periods: periods || [] });
  }

  return c.json({ pools });
});

/** POST /api/merchant/pools — create capital pool */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string; operator_id: string; initial_capital: number;
    currency?: string; profit_split_owner?: number; profit_split_operator?: number;
    minimum_reserve?: number; payout_cycle?: string; settlement_cutoff_day?: number;
    start_date?: string;
  }>();

  if (!body.relationship_id || !body.operator_id || !body.initial_capital) {
    return c.json({ error: 'relationship_id, operator_id, initial_capital required' }, 400);
  }

  const now = new Date().toISOString();
  const poolId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_pool_accounts (id, relationship_id, capital_owner_id, operator_id, initial_capital, current_capital, minimum_reserve, currency, profit_split_owner, profit_split_operator, payout_cycle, settlement_cutoff_day, status, start_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).bind(poolId, body.relationship_id, merchant.id, body.operator_id,
    body.initial_capital, body.initial_capital, body.minimum_reserve || 0,
    body.currency || 'USDT', body.profit_split_owner ?? 0.6, body.profit_split_operator ?? 0.4,
    body.payout_cycle || 'monthly', body.settlement_cutoff_day ?? 28,
    body.start_date || now.slice(0, 10), now, now).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'pool', ?, 'create', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, poolId, now).run();

  const pool = await c.env.DB.prepare('SELECT * FROM merchant_pool_accounts WHERE id = ?').bind(poolId).first();
  return c.json({ pool }, 201);
});

/** POST /api/merchant/pools/:id/top-up */
app.post('/:id/top-up', async (c) => {
  const userId = c.get('userId');
  const poolId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ amount: number }>();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE merchant_pool_accounts SET current_capital = current_capital + ?, updated_at = ? WHERE id = ? AND capital_owner_id = ?'
  ).bind(body.amount, now, poolId, merchant.id).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/pools/:id/withdraw */
app.post('/:id/withdraw', async (c) => {
  const userId = c.get('userId');
  const poolId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ amount: number }>();
  const now = new Date().toISOString();

  const pool = await c.env.DB.prepare('SELECT * FROM merchant_pool_accounts WHERE id = ?').bind(poolId).first<any>();
  if (!pool) return c.json({ error: 'Pool not found' }, 404);
  if (pool.current_capital - body.amount < pool.minimum_reserve) {
    return c.json({ error: 'Withdrawal would breach minimum reserve' }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE merchant_pool_accounts SET current_capital = current_capital - ?, updated_at = ? WHERE id = ?'
  ).bind(body.amount, now, poolId).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/pools/:id/close-period — create period snapshot */
app.post('/:id/close-period', async (c) => {
  const userId = c.get('userId');
  const poolId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    period_label: string; realized_profit: number; pool_fees?: number;
  }>();

  const pool = await c.env.DB.prepare('SELECT * FROM merchant_pool_accounts WHERE id = ?').bind(poolId).first<any>();
  if (!pool) return c.json({ error: 'Pool not found' }, 404);

  const now = new Date().toISOString();
  const periodId = crypto.randomUUID();

  // Apply loss carry-forward / high-water mark
  let carriedLossRecovered = 0;
  let distributableProfit = body.realized_profit - (body.pool_fees || 0);

  if (pool.loss_carry_forward > 0 && distributableProfit > 0) {
    carriedLossRecovered = Math.min(pool.loss_carry_forward, distributableProfit);
    distributableProfit -= carriedLossRecovered;
  }

  let newLossCarry = pool.loss_carry_forward - carriedLossRecovered;
  if (distributableProfit < 0) {
    newLossCarry += Math.abs(distributableProfit);
    distributableProfit = 0;
  }

  const ownerPayout = distributableProfit * pool.profit_split_owner;
  const operatorPayout = distributableProfit * pool.profit_split_operator;

  await c.env.DB.prepare(`
    INSERT INTO merchant_pool_periods (id, pool_id, period_label, opening_capital, realized_profit, carried_loss_recovered, pool_fees, distributable_profit, owner_payout, operator_payout, loss_carry_forward, closing_capital, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).bind(periodId, poolId, body.period_label,
    pool.current_capital, body.realized_profit, carriedLossRecovered,
    body.pool_fees || 0, distributableProfit, ownerPayout, operatorPayout,
    newLossCarry, pool.current_capital, now).run();

  // Update pool carry-forward
  await c.env.DB.prepare(
    'UPDATE merchant_pool_accounts SET loss_carry_forward = ?, high_water_mark = MAX(high_water_mark, ?), updated_at = ? WHERE id = ?'
  ).bind(newLossCarry, pool.current_capital, now, poolId).run();

  return c.json({ period_id: periodId, distributable_profit: distributableProfit, owner_payout: ownerPayout, operator_payout: operatorPayout }, 201);
});

export default app;
