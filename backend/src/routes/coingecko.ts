import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/coingecko — Proxy for CoinGecko API.
 * This is required for production because Vite's dev-server proxy is only for local development.
 * Note: Cloudflare Workers have a 2MB response limit but CoinGecko JSONs are typically 10-100KB.
 */
app.get('/*', async (c) => {
  const path = c.req.path.replace(/^\/api\/coingecko/, '');
  const search = c.req.url.split('?')[1] || '';
  const url = `https://api.coingecko.com/api/v3${path}${search ? '?' + search : ''}`;

  console.log(`[coingecko-proxy] GET ${url}`);

  try {
    const r = await fetch(url, {
      method: c.req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CoinCompass/1.0',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!r.ok) {
      console.warn(`[coingecko-proxy] Upstream error: ${r.status}`);
      return c.json({ error: 'CoinGecko upstream error', status: r.status }, r.status as any);
    }

    const data = await r.json();
    return c.json(data);
  } catch (err: any) {
    console.error(`[coingecko-proxy] Proxy failed: ${err.message}`);
    return c.json({ error: 'Internal proxy error', message: err.message }, 502);
  }
});

export default app;
