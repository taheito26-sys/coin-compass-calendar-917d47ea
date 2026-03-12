import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchant(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/comments?deal_id=&relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ comments: [] });

  const dealId = c.req.query('deal_id');
  const relId = c.req.query('relationship_id');

  let q: string, binds: unknown[];
  if (dealId) {
    q = `SELECT mc.*, mp.display_name AS sender_name, mp.nickname AS sender_nickname
      FROM merchant_comments mc
      JOIN merchant_profiles mp ON mp.id = mc.sender_merchant_id
      WHERE mc.deal_id = ? AND mc.deleted_at IS NULL ORDER BY mc.created_at ASC`;
    binds = [dealId];
  } else if (relId) {
    q = `SELECT mc.*, mp.display_name AS sender_name, mp.nickname AS sender_nickname
      FROM merchant_comments mc
      JOIN merchant_profiles mp ON mp.id = mc.sender_merchant_id
      WHERE mc.relationship_id = ? AND mc.deleted_at IS NULL ORDER BY mc.created_at ASC`;
    binds = [relId];
  } else {
    return c.json({ comments: [] });
  }

  const { results } = await c.env.DB.prepare(q).bind(...binds).all();
  return c.json({ comments: results || [] });
});

/** POST /api/merchant/comments */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchant(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    deal_id?: string; relationship_id: string; parent_id?: string;
    comment_type?: string; body: string;
  }>();

  if (!body.relationship_id || !body.body) {
    return c.json({ error: 'relationship_id and body required' }, 400);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_comments (id, deal_id, relationship_id, parent_id, sender_merchant_id, sender_user_id, comment_type, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.deal_id || null, body.relationship_id, body.parent_id || null,
    merchant.id, userId, body.comment_type || 'normal', body.body, now).run();

  return c.json({ comment_id: id }, 201);
});

export default app;
