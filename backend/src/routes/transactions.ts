import { Hono } from 'hono';
import type { Env, TransactionRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// All transaction routes require auth
app.use('/*', authMiddleware);

/** GET /api/transactions */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(`
    SELECT t.*, a.symbol AS asset_symbol, a.name AS asset_name
    FROM transactions t
    JOIN assets a ON t.asset_id = a.id
    WHERE t.user_id = ?
    ORDER BY t.timestamp DESC
  `).bind(userId).all<TransactionRow & { asset_symbol: string; asset_name: string }>();

  return c.json({ transactions: results || [] });
});

/** POST /api/transactions */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    asset_id: string;
    timestamp: string;
    type: string;
    qty: number;
    unit_price?: number;
    fee_amount?: number;
    fee_currency?: string;
    venue?: string;
    note?: string;
    tags?: string[];
    source?: string;
    external_id?: string;
  }>();

  if (!body.asset_id || !body.timestamp || !body.type || body.qty == null) {
    return c.json({ error: 'Missing required fields: asset_id, timestamp, type, qty' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO transactions (id, user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, tags, source, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, body.asset_id, body.timestamp, body.type, body.qty,
    body.unit_price ?? 0, body.fee_amount ?? 0, body.fee_currency ?? 'USD',
    body.venue ?? null, body.note ?? null,
    body.tags ? JSON.stringify(body.tags) : null,
    body.source ?? 'manual', body.external_id ?? null,
    now, now,
  ).run();

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<TransactionRow>();
  return c.json({ transaction: row }, 201);
});

/** PUT /api/transactions/:id */
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const txId = c.req.param('id');

  // Verify ownership
  const existing = await c.env.DB.prepare(
    'SELECT id FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(txId, userId).first();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const body = await c.req.json<Partial<{
    timestamp: string; type: string; qty: number; unit_price: number;
    fee_amount: number; fee_currency: string; venue: string; note: string;
    tags: string[]; source: string;
  }>>();

  // Explicit allowlist — only these fields may be updated
  const EDITABLE_FIELDS: Record<string, (v: unknown) => unknown> = {
    asset_id: (v) => String(v),
    timestamp: (v) => String(v),
    type: (v) => String(v),
    qty: (v) => Number(v),
    unit_price: (v) => Number(v),
    fee_amount: (v) => Number(v),
    fee_currency: (v) => String(v),
    venue: (v) => v == null ? null : String(v),
    note: (v) => v == null ? null : String(v),
    tags: (v) => v == null ? null : JSON.stringify(v),
    source: (v) => String(v),
  };

  const sets: string[] = [];
  const vals: unknown[] = [];

  for (const [key, sanitize] of Object.entries(EDITABLE_FIELDS)) {
    if (key in body) {
      sets.push(`${key} = ?`);
      vals.push(sanitize((body as Record<string, unknown>)[key]));
    }
  }

  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(txId);

  await c.env.DB.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const row = await c.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(txId).first<TransactionRow>();
  return c.json({ transaction: row });
});

/** POST /api/transactions/batch — create multiple transactions at once */
app.post('/batch', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    transactions: Array<{
      asset_id: string;
      timestamp: string;
      type: string;
      qty: number;
      unit_price?: number;
      fee_amount?: number;
      fee_currency?: string;
      venue?: string;
      note?: string;
      tags?: string[];
      source?: string;
      external_id?: string;
    }>;
    idempotency_key?: string;
  }>();

  if (!body.transactions || !Array.isArray(body.transactions)) {
    return c.json({ error: 'transactions array required' }, 400);
  }

  if (body.transactions.length > 500) {
    return c.json({ error: 'Maximum 500 transactions per batch' }, 400);
  }

  const now = new Date().toISOString();
  const createdIds: string[] = [];
  const skippedDuplicates: number[] = [];
  const errors: Array<{ index: number; reason: string }> = [];

  // Pre-fetch existing external_ids for this user to enable idempotent inserts
  const externalIds = new Set<string>();
  const existingExt = await c.env.DB.prepare(
    'SELECT external_id FROM transactions WHERE user_id = ? AND external_id IS NOT NULL'
  ).bind(userId).all<{ external_id: string }>();
  for (const row of (existingExt.results || [])) {
    externalIds.add(row.external_id);
  }

  for (let i = 0; i < body.transactions.length; i++) {
    const tx = body.transactions[i];
    if (!tx.asset_id || !tx.timestamp || !tx.type || tx.qty == null) {
      errors.push({ index: i, reason: `Missing required fields` });
      continue;
    }

    // Idempotency: skip if external_id already exists for this user
    if (tx.external_id && externalIds.has(tx.external_id)) {
      skippedDuplicates.push(i);
      continue;
    }

    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(`
        INSERT INTO transactions (id, user_id, asset_id, timestamp, type, qty, unit_price, fee_amount, fee_currency, venue, note, tags, source, external_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, userId, tx.asset_id, tx.timestamp, tx.type, tx.qty,
        tx.unit_price ?? 0, tx.fee_amount ?? 0, tx.fee_currency ?? 'USD',
        tx.venue ?? null, tx.note ?? null,
        tx.tags ? JSON.stringify(tx.tags) : null,
        tx.source ?? 'csv-import', tx.external_id ?? null,
        now, now,
      ).run();
      createdIds.push(id);
      if (tx.external_id) externalIds.add(tx.external_id);
    } catch (err: any) {
      // Treat unique constraint violations as skipped duplicates, not errors
      const msg = String(err?.message || "");
      if (msg.includes("UNIQUE constraint failed") || msg.includes("unique")) {
        skippedDuplicates.push(i);
      } else {
        errors.push({ index: i, reason: msg });
      }
    }
  }

  // Fetch all created transactions to return full objects
  let createdTransactions: TransactionRow[] = [];
  if (createdIds.length > 0) {
    // D1 doesn't support IN with bindings well for large lists, fetch in chunks
    const chunkSize = 50;
    for (let i = 0; i < createdIds.length; i += chunkSize) {
      const chunk = createdIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await c.env.DB.prepare(
        `SELECT * FROM transactions WHERE id IN (${placeholders})`
      ).bind(...chunk).all<TransactionRow>();
      createdTransactions.push(...(results || []));
    }
  }

  return c.json({
    created: createdIds.length,
    skippedDuplicates: skippedDuplicates.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 20),
    transactions: createdTransactions,
  }, createdIds.length > 0 || skippedDuplicates.length > 0 ? 201 : 400);
});

/** DELETE /api/transactions/all — remove all transactions for the user */
app.delete('/all', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE user_id = ?'
  ).bind(userId).run();
  return c.json({ ok: true, deleted: result.meta.changes ?? 0 });
});

/** DELETE /api/transactions/:id */
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const txId = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(txId, userId).run();

  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});

export default app;
