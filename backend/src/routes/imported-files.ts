import { Hono } from 'hono';
import type { Env, ImportedFileRow } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

app.use('/*', authMiddleware);

/** GET /api/imported-files */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM imported_files WHERE user_id = ? ORDER BY imported_at DESC'
  ).bind(userId).all<ImportedFileRow>();

  return c.json({ files: results || [] });
});

/** POST /api/imported-files */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    file_name: string;
    file_hash: string;
    exchange: string;
    export_type: string;
    row_count?: number;
  }>();

  if (!body.file_name || !body.file_hash || !body.exchange || !body.export_type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Check for duplicate
  const existing = await c.env.DB.prepare(
    'SELECT id FROM imported_files WHERE user_id = ? AND file_hash = ?'
  ).bind(userId, body.file_hash).first();
  if (existing) {
    return c.json({ error: 'File already imported', duplicate: true }, 409);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO imported_files (id, user_id, file_name, file_hash, exchange, export_type, row_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, body.file_name, body.file_hash, body.exchange, body.export_type, body.row_count ?? 0).run();

  const row = await c.env.DB.prepare('SELECT * FROM imported_files WHERE id = ?').bind(id).first<ImportedFileRow>();
  return c.json({ file: row }, 201);
});

/** DELETE /api/imported-files/all — clear all imported file records */
app.delete('/all', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'DELETE FROM imported_files WHERE user_id = ?'
  ).bind(userId).run();
  return c.json({ ok: true, deleted: result.meta.changes ?? 0 });
});

export default app;
