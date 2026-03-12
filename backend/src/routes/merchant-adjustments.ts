import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/adjustments?deal_id= */
app.get('/', async (c) => {
  const dealId = c.req.query('deal_id');
  if (!dealId) return c.json({ adjustments: [] });

  const { results } = await c.env.DB.prepare(
    `SELECT a.*, mp.display_name AS requester_name FROM merchant_adjustments a
     JOIN merchant_profiles mp ON mp.id = a.requester_merchant_id
     WHERE a.deal_id = ? ORDER BY a.created_at DESC`
  ).bind(dealId).all();

  return c.json({ adjustments: results || [] });
});

/** POST /api/merchant/adjustments — create correction request */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    deal_id: string; relationship_id: string; field_challenged: string;
    old_value?: string; proposed_value: string; reason: string; evidence_url?: string;
  }>();

  if (!body.deal_id || !body.relationship_id || !body.field_challenged || !body.proposed_value || !body.reason) {
    return c.json({ error: 'deal_id, relationship_id, field_challenged, proposed_value, reason required' }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_adjustments (id, deal_id, relationship_id, requester_merchant_id, field_challenged, old_value, proposed_value, reason, evidence_url, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(id, body.deal_id, body.relationship_id, merchant.id,
    body.field_challenged, body.old_value || null, body.proposed_value,
    body.reason, body.evidence_url || null, now).run();

  // Create approval
  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'correction_request', 'adjustment', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, body.relationship_id, id, JSON.stringify(body), userId, merchant.id, now).run();

  return c.json({ adjustment_id: id, approval_id: approvalId }, 201);
});

/** POST /api/merchant/adjustments/:id/resolve */
app.post('/:id/resolve', async (c) => {
  const userId = c.get('userId');
  const adjId = c.req.param('id');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ status: 'approved' | 'rejected'; approved_adjustment_value?: string }>();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE merchant_adjustments SET status = ?, approver_merchant_id = ?, approved_adjustment_value = ?, resolved_at = ? WHERE id = ?'
  ).bind(body.status, merchant.id, body.approved_adjustment_value || null, now, adjId).run();

  return c.json({ ok: true });
});

export default app;
