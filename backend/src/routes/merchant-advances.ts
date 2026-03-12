import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/advances?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ advances: [] });
  const relId = c.req.query('relationship_id');

  let q: string, binds: unknown[];
  if (relId) {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'advance' AND d.relationship_id = ? AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [relId, merchant.id, merchant.id];
  } else {
    q = `SELECT d.* FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.deal_type = 'advance' AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    binds = [merchant.id, merchant.id];
  }
  const { results } = await c.env.DB.prepare(q).bind(...binds).all();

  // Enrich with funding lines for each advance
  const advances = [];
  for (const adv of (results || [])) {
    const { results: lines } = await c.env.DB.prepare(
      'SELECT * FROM merchant_deal_funding_lines WHERE deal_id = ? ORDER BY created_at ASC'
    ).bind((adv as any).id).all();

    const sent = (lines || []).filter((l: any) => l.line_type === 'principal_sent').reduce((s: number, l: any) => s + l.amount, 0);
    const returned = (lines || []).filter((l: any) => l.line_type === 'principal_returned').reduce((s: number, l: any) => s + l.amount, 0);

    advances.push({
      ...adv,
      funding_lines: lines || [],
      principal_sent: sent,
      principal_returned: returned,
      outstanding_principal: sent - returned,
    });
  }

  return c.json({ advances });
});

/** POST /api/merchant/advances — create advance deal */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string; title: string; amount: number; currency?: string;
    due_date?: string; fee_amount?: number; note?: string;
  }>();

  if (!body.relationship_id || !body.title || !body.amount) {
    return c.json({ error: 'relationship_id, title, amount required' }, 400);
  }

  const access = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(body.relationship_id, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Relationship not found or inactive' }, 403);

  const now = new Date().toISOString();
  const dealId = crypto.randomUUID();

  // Create deal with type=advance
  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, metadata, due_date, created_by, created_at, updated_at)
    VALUES (?, ?, 'advance', ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
  `).bind(dealId, body.relationship_id, body.title, body.amount,
    body.currency || 'USDT', JSON.stringify({ fee_amount: body.fee_amount || 0, note: body.note || '' }),
    body.due_date || null, merchant.id, now, now).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'create', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, dealId, now).run();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first();
  return c.json({ advance: deal }, 201);
});

/** POST /api/merchant/advances/:id/send — record principal sent */
app.post('/:id/send', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    amount: number; currency?: string; usdt_qty?: number; unit_rate?: number;
    transfer_reference?: string; source_wallet?: string; destination_wallet?: string;
  }>();

  const now = new Date().toISOString();
  const lineId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_deal_funding_lines (id, deal_id, line_type, amount, currency, usdt_qty, unit_rate, transfer_reference, source_wallet, destination_wallet, creator_merchant_id, created_at)
    VALUES (?, ?, 'principal_sent', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(lineId, dealId, body.amount, body.currency || 'USDT', body.usdt_qty ?? body.amount,
    body.unit_rate ?? null, body.transfer_reference || null,
    body.source_wallet || null, body.destination_wallet || null, merchant.id, now).run();

  // Update deal status to sent if draft
  await c.env.DB.prepare(
    "UPDATE merchant_deals SET status = CASE WHEN status = 'draft' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?"
  ).bind(now, dealId).run();

  return c.json({ funding_line_id: lineId }, 201);
});

/** POST /api/merchant/advances/:id/return — record principal returned */
app.post('/:id/return', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    amount: number; currency?: string; transfer_reference?: string;
  }>();

  const now = new Date().toISOString();
  const lineId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_deal_funding_lines (id, deal_id, line_type, amount, currency, transfer_reference, creator_merchant_id, created_at)
    VALUES (?, ?, 'principal_returned', ?, ?, ?, ?, ?)
  `).bind(lineId, dealId, body.amount, body.currency || 'USDT', body.transfer_reference || null, merchant.id, now).run();

  // Check if fully returned
  const { results: lines } = await c.env.DB.prepare(
    'SELECT * FROM merchant_deal_funding_lines WHERE deal_id = ?'
  ).bind(dealId).all();
  const sent = (lines || []).filter((l: any) => l.line_type === 'principal_sent').reduce((s: number, l: any) => s + l.amount, 0);
  const returned = (lines || []).filter((l: any) => l.line_type === 'principal_returned').reduce((s: number, l: any) => s + l.amount, 0);

  if (returned >= sent) {
    await c.env.DB.prepare("UPDATE merchant_deals SET status = 'settled', close_date = ?, updated_at = ? WHERE id = ?").bind(now, now, dealId).run();
  }

  return c.json({ funding_line_id: lineId, outstanding: sent - returned }, 201);
});

export default app;
