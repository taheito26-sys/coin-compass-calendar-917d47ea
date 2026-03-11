# Merchant Platform — Complete Build Guide

> **Purpose**: This document contains everything needed to recreate the Merchant Platform from scratch using ChatGPT Codex or any AI coding agent. It includes the full database schema, every backend route (with complete source code), the frontend API client, the full UI page, auth middleware, CORS setup, and wiring instructions.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Schema (D1/SQLite)](#3-database-schema)
4. [Auth Middleware](#4-auth-middleware)
5. [CORS Middleware](#5-cors-middleware)
6. [Backend Types](#6-backend-types)
7. [Backend Routes](#7-backend-routes)
   - 7.1 [Profiles](#71-profiles)
   - 7.2 [Invites](#72-invites)
   - 7.3 [Relationships](#73-relationships)
   - 7.4 [Deals](#74-deals)
   - 7.5 [Messages](#75-messages)
   - 7.6 [Approvals](#76-approvals)
   - 7.7 [Audit](#77-audit)
   - 7.8 [Notifications](#78-notifications)
8. [Route Wiring (index.ts)](#8-route-wiring)
9. [Frontend API Client](#9-frontend-api-client)
10. [Frontend UI Page](#10-frontend-ui-page)
11. [Wrangler Configuration](#11-wrangler-configuration)
12. [Deployment](#12-deployment)
13. [End-to-End Flows](#13-end-to-end-flows)

---

## 1. Architecture Overview

```
┌──────────────────┐       ┌───────────────────────────┐       ┌──────────┐
│  React Frontend  │──────▶│  Cloudflare Worker (Hono) │──────▶│ D1 (SQLite) │
│  (Vite + TS)     │  JWT  │  /api/merchant/*          │  SQL  │ 12 tables   │
│  Clerk Auth UI   │◀──────│  RS256 JWT verification   │◀──────│             │
└──────────────────┘       └───────────────────────────┘       └──────────┘
```

- **Frontend**: React 18 + Vite + TypeScript. Auth via `@clerk/react`.
- **Backend**: Cloudflare Worker using [Hono](https://hono.dev/) framework.
- **Database**: Cloudflare D1 (SQLite). 12 merchant-specific tables.
- **Auth**: Clerk RS256 JWTs verified server-side via JWKS endpoint. No Supabase.
- **State sync**: Polling-based (no WebSockets). Unread count polled every 15s.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18, Vite, TypeScript | SPA with react-router-dom |
| Auth | Clerk (`@clerk/react`) | RS256 JWTs, `window.Clerk.session.getToken()` |
| Backend | Hono on Cloudflare Workers | TypeScript, Wrangler for deploy |
| Database | Cloudflare D1 (SQLite) | Bound as `DB` in wrangler.toml |
| Cache | Cloudflare KV | Used for price data, not merchant |

### Dependencies (backend/package.json)

```json
{
  "dependencies": {
    "hono": "^4.x"
  },
  "devDependencies": {
    "wrangler": "^3.x",
    "@cloudflare/workers-types": "^4.x",
    "typescript": "^5.x"
  }
}
```

### Dependencies (frontend)

```
@clerk/react ^6.x
react ^18.x
react-router-dom ^6.x
```

---

## 3. Database Schema

Apply this SQL to your D1 database (`wrangler d1 execute <db-name> --file=seed/merchant-schema.sql`):

```sql
-- ============================================================
-- Merchant Platform Schema — Full Cycle
-- ============================================================

-- Merchant Profiles
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  owner_user_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL UNIQUE,           -- MRC-XXXXXXXX
  nickname TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  merchant_type TEXT NOT NULL DEFAULT 'independent',  -- independent|desk|partner|other
  region TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USDT',
  discoverability TEXT NOT NULL DEFAULT 'public',     -- public|merchant_id_only|hidden
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',              -- active|restricted|suspended|archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mp_owner ON merchant_profiles(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mp_nickname ON merchant_profiles(nickname);

-- Merchant Invites
CREATE TABLE IF NOT EXISTS merchant_invites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  to_merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|accepted|rejected|withdrawn|expired
  purpose TEXT,
  requested_role TEXT NOT NULL DEFAULT 'operator',
  message TEXT,
  requested_scope TEXT,                               -- JSON array
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_to ON merchant_invites(to_merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_from ON merchant_invites(from_merchant_id, status);

-- Merchant Relationships
CREATE TABLE IF NOT EXISTS merchant_relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  merchant_a_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  merchant_b_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  invite_id TEXT REFERENCES merchant_invites(id),
  relationship_type TEXT NOT NULL DEFAULT 'general',  -- general|lending|arbitrage|capital|strategic
  status TEXT NOT NULL DEFAULT 'active',              -- active|restricted|suspended|terminated|archived
  shared_fields TEXT,                                 -- JSON array
  approval_policy TEXT,                               -- JSON object
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rel_a ON merchant_relationships(merchant_a_id, status);
CREATE INDEX IF NOT EXISTS idx_rel_b ON merchant_relationships(merchant_b_id, status);

-- Merchant Roles (per relationship)
CREATE TABLE IF NOT EXISTS merchant_roles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchant_profiles(id),
  role TEXT NOT NULL DEFAULT 'viewer',               -- owner|admin|operator|finance|viewer|commenter
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mr_uniq ON merchant_roles(relationship_id, merchant_id);

-- Deals
CREATE TABLE IF NOT EXISTS merchant_deals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  deal_type TEXT NOT NULL,                           -- lending|arbitrage|partnership|capital_placement
  title TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL DEFAULT 'draft',              -- draft|active|due|settled|closed|overdue|cancelled
  metadata TEXT,                                     -- JSON
  issue_date TEXT,
  due_date TEXT,
  close_date TEXT,
  expected_return REAL,
  realized_pnl REAL,
  created_by TEXT NOT NULL,                          -- merchant_id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deals_rel ON merchant_deals(relationship_id, status);

-- Settlements
CREATE TABLE IF NOT EXISTS merchant_settlements (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  paid_amount REAL NOT NULL,
  paid_date TEXT NOT NULL,
  variance_note TEXT,
  submitted_by TEXT NOT NULL,                        -- merchant_id
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|approved|rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sett_deal ON merchant_settlements(deal_id);

-- Profit Records
CREATE TABLE IF NOT EXISTS merchant_profit_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  deal_id TEXT NOT NULL REFERENCES merchant_deals(id),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  period TEXT NOT NULL,
  gross_profit REAL NOT NULL,
  net_distributable REAL NOT NULL,
  share_a REAL,
  share_b REAL,
  note TEXT,
  submitted_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prof_deal ON merchant_profit_records(deal_id);

-- Approval Requests
CREATE TABLE IF NOT EXISTS merchant_approvals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  type TEXT NOT NULL,                                -- settlement_submit|profit_record_submit|capital_adjustment|deal_close|relationship_suspend|relationship_terminate|permissions_change
  target_entity_type TEXT,
  target_entity_id TEXT,
  proposed_payload TEXT,                             -- JSON
  status TEXT NOT NULL DEFAULT 'pending',             -- pending|approved|rejected|cancelled|expired
  submitted_by_user_id TEXT NOT NULL,
  submitted_by_merchant_id TEXT NOT NULL,
  resolution_note TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_appr_rel ON merchant_approvals(relationship_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_user ON merchant_approvals(submitted_by_user_id);

-- Messages
CREATE TABLE IF NOT EXISTS merchant_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  relationship_id TEXT NOT NULL REFERENCES merchant_relationships(id),
  sender_user_id TEXT NOT NULL,
  sender_merchant_id TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',          -- text|system|request-note
  body TEXT NOT NULL,
  read_by TEXT,                                       -- JSON array of user_ids
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_rel ON merchant_messages(relationship_id, created_at);

-- Audit Logs
CREATE TABLE IF NOT EXISTS merchant_audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  actor_user_id TEXT NOT NULL,
  actor_merchant_id TEXT,
  entity_type TEXT NOT NULL,                         -- invite|relationship|deal|approval|message|profile|settlement|profit
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                              -- create|update|approve|reject|close|terminate|suspend|archive
  before_state TEXT,                                 -- JSON
  after_state TEXT,                                  -- JSON
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON merchant_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON merchant_audit_logs(actor_user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS merchant_notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  merchant_id TEXT,
  category TEXT NOT NULL,                            -- invite|message|approval|due_alert|risk|system
  title TEXT NOT NULL,
  body TEXT,
  link_type TEXT,                                    -- relationship|deal|invite|approval
  link_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON merchant_notifications(user_id, read_at);
```

### Key Design Decisions

- **IDs**: All primary keys are `TEXT` using `lower(hex(randomblob(16)))` — 32-char hex strings
- **Timestamps**: All stored as ISO 8601 `TEXT` via `datetime('now')`
- **JSON fields**: `shared_fields`, `approval_policy`, `metadata`, `proposed_payload`, `read_by` — stored as JSON text
- **One profile per user**: Enforced by `UNIQUE INDEX idx_mp_owner ON merchant_profiles(owner_user_id)`
- **Merchant ID format**: `MRC-XXXXXXXX` (8 hex chars, uppercase)

---

## 4. Auth Middleware

**File: `backend/src/middleware/auth.ts`**

Verifies Clerk RS256 JWTs using the JWKS endpoint. Caches imported RSA keys for 1 hour.

```typescript
import { Context, Next } from "hono";
import type { Env } from "../types";

let jwksCache: Map<string, CryptoKey> = new Map();
let jwksCacheTs = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwksUrl = c.env.CLERK_JWKS_URL;
  if (!jwksUrl) {
    console.error("CLERK_JWKS_URL is missing");
    return c.json({ error: "Server misconfiguration: missing Clerk JWKS URL" }, 500);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyRs256(token, jwksUrl);
    const now = Date.now() / 1000;
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Invalid token: missing sub" }, 401);
    }
    if (typeof payload.exp === "number" && payload.exp < now) {
      return c.json({ error: "Token expired" }, 401);
    }
    if (typeof payload.nbf === "number" && payload.nbf > now) {
      return c.json({ error: "Token not active yet" }, 401);
    }

    c.set("userId", userId);
    await next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return c.json({ error: "Invalid token" }, 401);
  }
}

async function verifyRs256(
  token: string,
  jwksUrl: string,
): Promise<Record<string, string | number | boolean | null | undefined>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string; kid?: string };

  if (header.alg !== "RS256") throw new Error(`Unsupported algorithm: ${header.alg ?? "unknown"}`);
  if (!header.kid) throw new Error("JWT missing kid in header");

  const key = await getJwksKey(jwksUrl, header.kid);
  if (!key) throw new Error(`No matching key found for kid: ${header.kid}`);

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBuffer(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key, signature, data,
  );

  if (!valid) throw new Error("Invalid signature");
  return JSON.parse(base64UrlDecode(payloadB64));
}

async function getJwksKey(jwksUrl: string, kid: string): Promise<CryptoKey | null> {
  if (jwksCache.has(kid) && Date.now() - jwksCacheTs < JWKS_CACHE_TTL_MS) {
    return jwksCache.get(kid) ?? null;
  }

  const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Failed to fetch JWKS: ${response.status}`);

  const jwks = (await response.json()) as { keys?: JsonWebKey[] };
  jwksCache = new Map();
  jwksCacheTs = Date.now();

  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk", jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false, ["verify"],
      );
      jwksCache.set(jwk.kid, key);
    } catch (error) {
      console.warn(`Failed to import JWK kid=${jwk.kid}:`, error);
    }
  }

  return jwksCache.get(kid) ?? null;
}

function normalizeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  return pad === 0 ? normalized : `${normalized}${"=".repeat(4 - pad)}`;
}

function base64UrlDecode(input: string): string {
  return atob(normalizeBase64Url(input));
}

function base64UrlToBuffer(input: string): ArrayBuffer {
  const binary = atob(normalizeBase64Url(input));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
```

### Environment Requirements

The Worker needs a secret `CLERK_JWKS_URL` set to:
```
https://<your-clerk-domain>/.well-known/jwks.json
```

Set via: `wrangler secret put CLERK_JWKS_URL`

---

## 5. CORS Middleware

**File: `backend/src/middleware/cors.ts`**

```typescript
import { Context, Next } from "hono";
import type { Env } from "../types";

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header("Origin") || "";
  const allowed = getAllowedOrigins(c.env);
  const isAllowed = isAllowedOrigin(origin, allowed);

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(isAllowed ? origin : ""),
    });
  }

  try {
    await next();
  } finally {
    if (isAllowed) {
      const headers = corsHeaders(origin);
      for (const [k, v] of Object.entries(headers)) {
        c.res.headers.set(k, v);
      }
    }
  }
}

function getAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS || "http://localhost:5173";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes("*") || allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host.endsWith(".lovableproject.com")) return true;
    if (host.endsWith(".lovable.app")) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch { return false; }
  return false;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
```

---

## 6. Backend Types

**File: `backend/src/types.ts`** (relevant excerpt)

```typescript
export interface Env {
  DB: D1Database;
  PRICE_KV: KVNamespace;
  CLERK_JWKS_URL?: string;
  ALLOWED_ORIGINS?: string;
}
```

---

## 7. Backend Routes

Every route file follows this pattern:
1. Create a Hono app with typed bindings
2. Apply `authMiddleware` globally
3. Define a `getMerchantForUser()` helper to look up the caller's merchant profile
4. Export the app as default

### 7.1 Profiles

**File: `backend/src/routes/merchant-profiles.ts`**
**Mount point: `/api/merchant`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile/me` | Get current user's merchant profile |
| POST | `/profile` | Create merchant profile (onboarding) |
| PATCH | `/profile/me` | Update own profile |
| GET | `/profile/:merchantId` | Get public profile by merchant_id or UUID |
| GET | `/search?q=` | Search merchants by ID/nickname/display_name |
| GET | `/check-nickname?nickname=` | Check nickname availability |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

function generateMerchantId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `MRC-${hex}`;
}

/** GET /api/merchant/profile/me */
app.get('/profile/me', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    'SELECT * FROM merchant_profiles WHERE owner_user_id = ?'
  ).bind(userId).first();
  if (!row) return c.json({ profile: null });
  return c.json({ profile: row });
});

/** POST /api/merchant/profile — create merchant profile */
app.post('/profile', async (c) => {
  const userId = c.get('userId');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE owner_user_id = ?'
  ).bind(userId).first();
  if (existing) return c.json({ error: 'You already have a merchant profile' }, 409);

  const body = await c.req.json<{
    nickname: string; display_name: string; merchant_type?: string;
    region?: string; default_currency?: string; discoverability?: string; bio?: string;
  }>();

  if (!body.nickname || !body.display_name) {
    return c.json({ error: 'nickname and display_name are required' }, 400);
  }

  const nick = body.nickname.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(nick)) {
    return c.json({ error: 'Nickname must be 3-30 chars: a-z, 0-9, underscore only' }, 400);
  }

  const nickExists = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE nickname = ?'
  ).bind(nick).first();
  if (nickExists) return c.json({ error: 'Nickname already taken' }, 409);

  const id = crypto.randomUUID();
  const merchantId = generateMerchantId();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_profiles (id, owner_user_id, merchant_id, nickname, display_name, merchant_type, region, default_currency, discoverability, bio, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(
    id, userId, merchantId, nick, body.display_name.trim(),
    body.merchant_type || 'independent', body.region || null,
    body.default_currency || 'USDT', body.discoverability || 'public',
    body.bio || null, now, now
  ).run();

  const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE id = ?').bind(id).first();
  return c.json({ profile }, 201);
});

/** PATCH /api/merchant/profile/me */
app.patch('/profile/me', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Partial<{
    display_name: string; merchant_type: string; region: string;
    default_currency: string; discoverability: string; bio: string;
  }>>();

  const EDITABLE: Record<string, (v: unknown) => unknown> = {
    display_name: v => String(v).trim(),
    merchant_type: v => String(v),
    region: v => v == null ? null : String(v),
    default_currency: v => String(v),
    discoverability: v => String(v),
    bio: v => v == null ? null : String(v),
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, sanitize] of Object.entries(EDITABLE)) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(sanitize((body as any)[key])); }
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  sets.push('updated_at = ?');
  vals.push(new Date().toISOString());
  vals.push(userId);

  await c.env.DB.prepare(`UPDATE merchant_profiles SET ${sets.join(', ')} WHERE owner_user_id = ?`).bind(...vals).run();
  const profile = await c.env.DB.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first();
  return c.json({ profile });
});

/** GET /api/merchant/profile/:merchantId */
app.get('/profile/:merchantId', async (c) => {
  const mid = c.req.param('merchantId');
  const row = await c.env.DB.prepare(
    "SELECT id, merchant_id, nickname, display_name, merchant_type, region, default_currency, bio, status, created_at FROM merchant_profiles WHERE (merchant_id = ? OR id = ?) AND status = 'active'"
  ).bind(mid, mid).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ profile: row });
});

/** GET /api/merchant/search?q= */
app.get('/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q || q.length < 2) return c.json({ results: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT id, merchant_id, nickname, display_name, merchant_type, region, bio, status
    FROM merchant_profiles
    WHERE status = 'active'
      AND discoverability != 'hidden'
      AND (merchant_id = ? OR nickname LIKE ? OR display_name LIKE ?)
    LIMIT 20
  `).bind(q, `%${q}%`, `%${q}%`).all();

  return c.json({ results: results || [] });
});

/** GET /api/merchant/check-nickname?nickname= */
app.get('/check-nickname', async (c) => {
  const nick = (c.req.query('nickname') || '').trim().toLowerCase();
  if (!nick) return c.json({ available: false });
  const exists = await c.env.DB.prepare(
    'SELECT id FROM merchant_profiles WHERE nickname = ?'
  ).bind(nick).first();
  return c.json({ available: !exists });
});

export default app;
```

### 7.2 Invites

**File: `backend/src/routes/merchant-invites.ts`**
**Mount point: `/api/merchant/invites`**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Send invite to another merchant |
| GET | `/inbox` | List received invites |
| GET | `/sent` | List sent invites |
| POST | `/:id/accept` | Accept invite → creates relationship + roles |
| POST | `/:id/reject` | Reject invite |
| POST | `/:id/withdraw` | Withdraw sent invite |

**Key behavior on accept:**
1. Creates a `merchant_relationships` row with `status='active'`
2. Creates two `merchant_roles` rows (sender=owner, receiver=requested_role)
3. Updates invite to `status='accepted'`
4. Sends notification to invite sender
5. Creates a system message in the new relationship
6. Logs to audit

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** POST /api/merchant/invites */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'Create merchant profile first' }, 403);

  const body = await c.req.json<{
    to_merchant_id: string; purpose?: string; requested_role?: string;
    message?: string; requested_scope?: string[];
  }>();

  if (!body.to_merchant_id) return c.json({ error: 'to_merchant_id required' }, 400);
  if (body.to_merchant_id === merchant.id) return c.json({ error: 'Cannot invite yourself' }, 400);

  const target = await c.env.DB.prepare(
    "SELECT id, status FROM merchant_profiles WHERE id = ? AND status = 'active'"
  ).bind(body.to_merchant_id).first();
  if (!target) return c.json({ error: 'Target merchant not found' }, 404);

  const existingInvite = await c.env.DB.prepare(
    "SELECT id FROM merchant_invites WHERE from_merchant_id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(merchant.id, body.to_merchant_id).first();
  if (existingInvite) return c.json({ error: 'Pending invite already exists' }, 409);

  const existingRel = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE ((merchant_a_id = ? AND merchant_b_id = ?) OR (merchant_a_id = ? AND merchant_b_id = ?)) AND status IN ('active','restricted')"
  ).bind(merchant.id, body.to_merchant_id, body.to_merchant_id, merchant.id).first();
  if (existingRel) return c.json({ error: 'Active relationship already exists' }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_invites (id, from_merchant_id, to_merchant_id, status, purpose, requested_role, message, requested_scope, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, merchant.id, body.to_merchant_id, body.purpose || null,
    body.requested_role || 'operator', body.message || null,
    body.requested_scope ? JSON.stringify(body.requested_scope) : null,
    expiresAt, now, now
  ).run();

  // Notification for receiver
  const targetProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(body.to_merchant_id).first<any>();
  if (targetProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'invite', ?, ?, 'invite', ?, ?)
    `).bind(crypto.randomUUID(), targetProfile.owner_user_id, body.to_merchant_id,
      `New invite from ${merchant.display_name}`, body.message || 'You have a new collaboration invite',
      id, now).run();
  }

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, id, JSON.stringify({ to: body.to_merchant_id, purpose: body.purpose }), now).run();

  const invite = await c.env.DB.prepare('SELECT * FROM merchant_invites WHERE id = ?').bind(id).first();
  return c.json({ invite }, 201);
});

/** GET /api/merchant/invites/inbox */
app.get('/inbox', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ invites: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT i.*, mp.display_name AS from_display_name, mp.nickname AS from_nickname, mp.merchant_id AS from_merchant_code
    FROM merchant_invites i
    JOIN merchant_profiles mp ON mp.id = i.from_merchant_id
    WHERE i.to_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(merchant.id).all();
  return c.json({ invites: results || [] });
});

/** GET /api/merchant/invites/sent */
app.get('/sent', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ invites: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT i.*, mp.display_name AS to_display_name, mp.nickname AS to_nickname, mp.merchant_id AS to_merchant_code
    FROM merchant_invites i
    JOIN merchant_profiles mp ON mp.id = i.to_merchant_id
    WHERE i.from_merchant_id = ?
    ORDER BY i.created_at DESC
  `).bind(merchant.id).all();
  return c.json({ invites: results || [] });
});

/** POST /api/merchant/invites/:id/accept */
app.post('/:id/accept', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const invite = await c.env.DB.prepare(
    "SELECT * FROM merchant_invites WHERE id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(inviteId, merchant.id).first<any>();
  if (!invite) return c.json({ error: 'Invite not found or not pending' }, 404);

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await c.env.DB.prepare("UPDATE merchant_invites SET status = 'expired', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), inviteId).run();
    return c.json({ error: 'Invite has expired' }, 410);
  }

  const now = new Date().toISOString();
  const relId = crypto.randomUUID();

  // Create relationship
  await c.env.DB.prepare(`
    INSERT INTO merchant_relationships (id, merchant_a_id, merchant_b_id, invite_id, relationship_type, status, approval_policy, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'general', 'active', ?, ?, ?)
  `).bind(relId, invite.from_merchant_id, merchant.id, inviteId,
    JSON.stringify({ settlements: true, profits: true, capital_changes: true, closures: true }),
    now, now).run();

  // Create roles
  await c.env.DB.prepare(`
    INSERT INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)
  `).bind(crypto.randomUUID(), relId, invite.from_merchant_id, now).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_roles (id, relationship_id, merchant_id, role, created_at) VALUES (?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), relId, merchant.id, invite.requested_role || 'operator', now).run();

  // Update invite
  await c.env.DB.prepare("UPDATE merchant_invites SET status = 'accepted', updated_at = ? WHERE id = ?")
    .bind(now, inviteId).run();

  // Notify sender
  const senderProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(invite.from_merchant_id).first<any>();
  if (senderProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'invite', ?, ?, 'relationship', ?, ?)
    `).bind(crypto.randomUUID(), senderProfile.owner_user_id, invite.from_merchant_id,
      `${merchant.display_name} accepted your invite`, 'Your collaboration invite was accepted',
      relId, now).run();
  }

  // System message
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, 'system', ?, ?)
  `).bind(crypto.randomUUID(), relId, userId, merchant.id,
    `Collaboration started between ${invite.from_merchant_id} and ${merchant.display_name}`, now).run();

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'approve', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, inviteId,
    JSON.stringify({ relationship_id: relId }), now).run();

  return c.json({ relationship_id: relId, status: 'accepted' });
});

/** POST /api/merchant/invites/:id/reject */
app.post('/:id/reject', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    "UPDATE merchant_invites SET status = 'rejected', updated_at = ? WHERE id = ? AND to_merchant_id = ? AND status = 'pending'"
  ).bind(now, inviteId, merchant.id).run();
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, note, created_at)
    VALUES (?, ?, ?, 'invite', ?, 'reject', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, inviteId, (body as any).reason || null, now).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/invites/:id/withdraw */
app.post('/:id/withdraw', async (c) => {
  const userId = c.get('userId');
  const inviteId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(
    "UPDATE merchant_invites SET status = 'withdrawn', updated_at = ? WHERE id = ? AND from_merchant_id = ? AND status = 'pending'"
  ).bind(now, inviteId, merchant.id).run();
  if (!result.meta.changes) return c.json({ error: 'Not found' }, 404);

  return c.json({ ok: true });
});

export default app;
```

### 7.3 Relationships

**File: `backend/src/routes/merchant-relationships.ts`**
**Mount point: `/api/merchant/relationships`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all relationships for current merchant |
| GET | `/:id` | Get relationship detail + roles + deal summary |
| PATCH | `/:id/settings` | Update relationship_type, shared_fields, approval_policy |
| POST | `/:id/suspend` | Suspend relationship |
| POST | `/:id/terminate` | Terminate relationship |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/relationships */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ relationships: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT r.*,
      pa.display_name AS a_display_name, pa.nickname AS a_nickname, pa.merchant_id AS a_merchant_code,
      pb.display_name AS b_display_name, pb.nickname AS b_nickname, pb.merchant_id AS b_merchant_code,
      mr.role AS my_role
    FROM merchant_relationships r
    JOIN merchant_profiles pa ON pa.id = r.merchant_a_id
    JOIN merchant_profiles pb ON pb.id = r.merchant_b_id
    LEFT JOIN merchant_roles mr ON mr.relationship_id = r.id AND mr.merchant_id = ?
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?)
    ORDER BY r.created_at DESC
  `).bind(merchant.id, merchant.id, merchant.id).all();

  return c.json({ relationships: results || [] });
});

/** GET /api/merchant/relationships/:id */
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const rel = await c.env.DB.prepare(`
    SELECT r.*,
      pa.display_name AS a_display_name, pa.nickname AS a_nickname, pa.merchant_id AS a_merchant_code,
      pb.display_name AS b_display_name, pb.nickname AS b_nickname, pb.merchant_id AS b_merchant_code
    FROM merchant_relationships r
    JOIN merchant_profiles pa ON pa.id = r.merchant_a_id
    JOIN merchant_profiles pb ON pb.id = r.merchant_b_id
    WHERE r.id = ? AND (r.merchant_a_id = ? OR r.merchant_b_id = ?)
  `).bind(relId, merchant.id, merchant.id).first();
  if (!rel) return c.json({ error: 'Not found' }, 404);

  const { results: roles } = await c.env.DB.prepare(
    'SELECT * FROM merchant_roles WHERE relationship_id = ?'
  ).bind(relId).all();

  const dealSummary = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total_deals,
      SUM(CASE WHEN status IN ('active','due') THEN amount ELSE 0 END) AS active_exposure,
      SUM(CASE WHEN status = 'settled' OR status = 'closed' THEN COALESCE(realized_pnl, 0) ELSE 0 END) AS realized_profit
    FROM merchant_deals WHERE relationship_id = ?
  `).bind(relId).first<any>();

  const pendingApprovals = await c.env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM merchant_approvals WHERE relationship_id = ? AND status = 'pending'"
  ).bind(relId).first<any>();

  return c.json({
    relationship: rel,
    roles: roles || [],
    summary: {
      totalDeals: dealSummary?.total_deals || 0,
      activeExposure: dealSummary?.active_exposure || 0,
      realizedProfit: dealSummary?.realized_profit || 0,
      pendingApprovals: pendingApprovals?.cnt || 0,
    },
  });
});

/** PATCH /api/merchant/relationships/:id/settings */
app.patch('/:id/settings', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ relationship_type?: string; shared_fields?: string[]; approval_policy?: Record<string, boolean> }>();
  const now = new Date().toISOString();

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.relationship_type) { sets.push('relationship_type = ?'); vals.push(body.relationship_type); }
  if (body.shared_fields) { sets.push('shared_fields = ?'); vals.push(JSON.stringify(body.shared_fields)); }
  if (body.approval_policy) { sets.push('approval_policy = ?'); vals.push(JSON.stringify(body.approval_policy)); }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push('updated_at = ?'); vals.push(now); vals.push(relId); vals.push(merchant.id); vals.push(merchant.id);

  await c.env.DB.prepare(`UPDATE merchant_relationships SET ${sets.join(', ')} WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)`).bind(...vals).run();
  return c.json({ ok: true });
});

/** POST /api/merchant/relationships/:id/suspend */
app.post('/:id/suspend', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE merchant_relationships SET status = 'suspended', updated_at = ? WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)"
  ).bind(now, relId, merchant.id, merchant.id).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'relationship', ?, 'suspend', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, relId, now).run();

  return c.json({ ok: true });
});

/** POST /api/merchant/relationships/:id/terminate */
app.post('/:id/terminate', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    "UPDATE merchant_relationships SET status = 'terminated', updated_at = ? WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)"
  ).bind(now, relId, merchant.id, merchant.id).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, created_at)
    VALUES (?, ?, ?, 'relationship', ?, 'terminate', ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, relId, now).run();

  return c.json({ ok: true });
});

export default app;
```

### 7.4 Deals

**File: `backend/src/routes/merchant-deals.ts`**
**Mount point: `/api/merchant/deals`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/?relationship_id=` | List deals (optionally filtered by relationship) |
| POST | `/` | Create a new deal |
| PATCH | `/:id` | Update deal fields |
| POST | `/:id/submit-settlement` | Submit settlement → creates approval |
| POST | `/:id/record-profit` | Record profit → creates approval |
| POST | `/:id/close` | Request deal close → creates approval |

**Key behavior**: All financial actions (settlement, profit, close) create `merchant_approvals` rows that require counterparty approval before mutating real data.

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

async function verifyRelationshipAccess(db: D1Database, relId: string, merchantId: string) {
  return db.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(relId, merchantId, merchantId).first();
}

/** GET /api/merchant/deals?relationship_id= */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ deals: [] });

  const relId = c.req.query('relationship_id');
  let query: string;
  let bindings: unknown[];

  if (relId) {
    query = `SELECT d.*, mr.merchant_a_id, mr.merchant_b_id
      FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE d.relationship_id = ? AND (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    bindings = [relId, merchant.id, merchant.id];
  } else {
    query = `SELECT d.*, mr.merchant_a_id, mr.merchant_b_id
      FROM merchant_deals d
      JOIN merchant_relationships mr ON mr.id = d.relationship_id
      WHERE (mr.merchant_a_id = ? OR mr.merchant_b_id = ?)
      ORDER BY d.created_at DESC`;
    bindings = [merchant.id, merchant.id];
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ deals: results || [] });
});

/** POST /api/merchant/deals */
app.post('/', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{
    relationship_id: string; deal_type: string; title: string; amount: number;
    currency?: string; issue_date?: string; due_date?: string;
    expected_return?: number; metadata?: Record<string, unknown>;
  }>();

  if (!body.relationship_id || !body.deal_type || !body.title || body.amount == null) {
    return c.json({ error: 'relationship_id, deal_type, title, amount required' }, 400);
  }

  const access = await verifyRelationshipAccess(c.env.DB, body.relationship_id, merchant.id);
  if (!access) return c.json({ error: 'Relationship not found or inactive' }, 403);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_deals (id, relationship_id, deal_type, title, amount, currency, status, metadata, issue_date, due_date, expected_return, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.relationship_id, body.deal_type, body.title, body.amount,
    body.currency || 'USDT', body.metadata ? JSON.stringify(body.metadata) : null,
    body.issue_date || null, body.due_date || null, body.expected_return ?? null,
    merchant.id, now, now
  ).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, id, JSON.stringify({ deal_type: body.deal_type, amount: body.amount }), now).run();

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(id).first();
  return c.json({ deal }, 201);
});

/** PATCH /api/merchant/deals/:id */
app.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Not found' }, 404);

  const access = await verifyRelationshipAccess(c.env.DB, deal.relationship_id, merchant.id);
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<Partial<{
    title: string; amount: number; status: string; due_date: string;
    expected_return: number; realized_pnl: number; close_date: string; metadata: Record<string, unknown>;
  }>>();

  const EDITABLE: Record<string, (v: unknown) => unknown> = {
    title: v => String(v), amount: v => Number(v), status: v => String(v),
    due_date: v => v == null ? null : String(v), expected_return: v => v == null ? null : Number(v),
    realized_pnl: v => v == null ? null : Number(v), close_date: v => v == null ? null : String(v),
    metadata: v => v == null ? null : JSON.stringify(v),
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, sanitize] of Object.entries(EDITABLE)) {
    if (key in body) { sets.push(`${key} = ?`); vals.push(sanitize((body as any)[key])); }
  }
  if (sets.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  sets.push('updated_at = ?'); vals.push(new Date().toISOString()); vals.push(dealId);
  await c.env.DB.prepare(`UPDATE merchant_deals SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, before_state, after_state, created_at)
    VALUES (?, ?, ?, 'deal', ?, 'update', ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, dealId,
    JSON.stringify({ status: deal.status }), JSON.stringify(body), new Date().toISOString()).run();

  const updated = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first();
  return c.json({ deal: updated });
});

/** POST /api/merchant/deals/:id/submit-settlement */
app.post('/:id/submit-settlement', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ paid_amount: number; paid_date: string; variance_note?: string }>();
  if (!body.paid_amount || !body.paid_date) return c.json({ error: 'paid_amount and paid_date required' }, 400);

  const now = new Date().toISOString();
  const settId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_settlements (id, deal_id, relationship_id, paid_amount, paid_date, variance_note, submitted_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(settId, dealId, deal.relationship_id, body.paid_amount, body.paid_date, body.variance_note || null, merchant.id, now).run();

  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'settlement_submit', 'settlement', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, settId,
    JSON.stringify({ paid_amount: body.paid_amount, paid_date: body.paid_date, deal_id: dealId }),
    userId, merchant.id, now).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, after_state, created_at)
    VALUES (?, ?, ?, 'settlement', ?, 'create', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, settId,
    JSON.stringify({ paid_amount: body.paid_amount, deal_id: dealId }), now).run();

  return c.json({ settlement_id: settId, approval_id: approvalId }, 201);
});

/** POST /api/merchant/deals/:id/record-profit */
app.post('/:id/record-profit', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ period: string; gross_profit: number; net_distributable: number; share_a?: number; share_b?: number; note?: string }>();

  const now = new Date().toISOString();
  const profitId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO merchant_profit_records (id, deal_id, relationship_id, period, gross_profit, net_distributable, share_a, share_b, note, submitted_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).bind(profitId, dealId, deal.relationship_id, body.period, body.gross_profit, body.net_distributable,
    body.share_a ?? null, body.share_b ?? null, body.note || null, merchant.id, now).run();

  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'profit_record_submit', 'profit', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, profitId, JSON.stringify(body), userId, merchant.id, now).run();

  return c.json({ profit_id: profitId, approval_id: approvalId }, 201);
});

/** POST /api/merchant/deals/:id/close */
app.post('/:id/close', async (c) => {
  const userId = c.get('userId');
  const dealId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const deal = await c.env.DB.prepare('SELECT * FROM merchant_deals WHERE id = ?').bind(dealId).first<any>();
  if (!deal) return c.json({ error: 'Deal not found' }, 404);

  const body = await c.req.json<{ realized_pnl?: number; note?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  const approvalId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO merchant_approvals (id, relationship_id, type, target_entity_type, target_entity_id, proposed_payload, status, submitted_by_user_id, submitted_by_merchant_id, submitted_at)
    VALUES (?, ?, 'deal_close', 'deal', ?, ?, 'pending', ?, ?, ?)
  `).bind(approvalId, deal.relationship_id, dealId,
    JSON.stringify({ realized_pnl: (body as any).realized_pnl, note: (body as any).note }),
    userId, merchant.id, now).run();

  return c.json({ approval_id: approvalId }, 201);
});

export default app;
```

### 7.5 Messages

**File: `backend/src/routes/merchant-messages.ts`**
**Mount point: `/api/merchant/messages`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:relId/messages` | Get messages for a relationship |
| POST | `/:relId/messages` | Send message (creates notification for counterparty) |
| POST | `/mark-read/:id` | Mark message as read |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/messages/:relId/messages */
app.get('/:relId/messages', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('relId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ messages: [] });

  const access = await c.env.DB.prepare(
    'SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const { results } = await c.env.DB.prepare(`
    SELECT m.*, mp.display_name AS sender_name, mp.nickname AS sender_nickname
    FROM merchant_messages m
    JOIN merchant_profiles mp ON mp.id = m.sender_merchant_id
    WHERE m.relationship_id = ? AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(relId, limit, offset).all();

  return c.json({ messages: (results || []).reverse() });
});

/** POST /api/merchant/messages/:relId/messages */
app.post('/:relId/messages', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('relId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const access = await c.env.DB.prepare(
    "SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?) AND status IN ('active','restricted')"
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ body: string; message_type?: string }>();
  if (!body.body?.trim()) return c.json({ error: 'Message body required' }, 400);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, relId, userId, merchant.id, body.message_type || 'text', body.body.trim(), now).run();

  // Notify counterparty
  const rel = await c.env.DB.prepare('SELECT merchant_a_id, merchant_b_id FROM merchant_relationships WHERE id = ?').bind(relId).first<any>();
  if (rel) {
    const counterpartyId = rel.merchant_a_id === merchant.id ? rel.merchant_b_id : rel.merchant_a_id;
    const cp = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?').bind(counterpartyId).first<any>();
    if (cp) {
      await c.env.DB.prepare(`
        INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
        VALUES (?, ?, ?, 'message', ?, ?, 'relationship', ?, ?)
      `).bind(crypto.randomUUID(), cp.owner_user_id, counterpartyId,
        `New message from ${merchant.display_name}`, body.body.trim().slice(0, 100),
        relId, now).run();
    }
  }

  const msg = await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(id).first();
  return c.json({ message: msg }, 201);
});

/** POST /api/merchant/messages/mark-read/:id */
app.post('/mark-read/:id', async (c) => {
  const userId = c.get('userId');
  const msgId = c.req.param('id');

  const msg = await c.env.DB.prepare('SELECT * FROM merchant_messages WHERE id = ?').bind(msgId).first<any>();
  if (!msg) return c.json({ error: 'Not found' }, 404);

  const readBy = msg.read_by ? JSON.parse(msg.read_by) : [];
  if (!readBy.includes(userId)) {
    readBy.push(userId);
    await c.env.DB.prepare('UPDATE merchant_messages SET read_by = ? WHERE id = ?')
      .bind(JSON.stringify(readBy), msgId).run();
  }

  return c.json({ ok: true });
});

export default app;
```

### 7.6 Approvals

**File: `backend/src/routes/merchant-approvals.ts`**
**Mount point: `/api/merchant/approvals`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/inbox` | Approvals where I'm in the relationship but didn't submit |
| GET | `/sent` | Approvals I submitted |
| POST | `/:id/approve` | Approve → applies mutation based on type |
| POST | `/:id/reject` | Reject → rejects linked settlement/profit |

**Critical behavior on approve** — the approve handler applies real mutations based on `approval.type`:

| Type | Mutation |
|------|----------|
| `settlement_submit` | Sets settlement to `approved`, deal to `settled`, adds to `realized_pnl` |
| `profit_record_submit` | Sets profit record to `approved`, adds `net_distributable` to deal `realized_pnl` |
| `deal_close` | Sets deal to `closed` with optional `realized_pnl` |
| `relationship_suspend` | Sets relationship to `suspended` |
| `relationship_terminate` | Sets relationship to `terminated` |
| `capital_adjustment` | Updates deal `amount` to `new_amount` |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/approvals/inbox */
app.get('/inbox', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ approvals: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT a.*, mp.display_name AS submitter_name, mp.nickname AS submitter_nickname
    FROM merchant_approvals a
    JOIN merchant_relationships r ON r.id = a.relationship_id
    JOIN merchant_profiles mp ON mp.id = a.submitted_by_merchant_id
    WHERE (r.merchant_a_id = ? OR r.merchant_b_id = ?)
      AND a.submitted_by_merchant_id != ?
    ORDER BY a.submitted_at DESC
  `).bind(merchant.id, merchant.id, merchant.id).all();

  return c.json({ approvals: results || [] });
});

/** GET /api/merchant/approvals/sent */
app.get('/sent', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ approvals: [] });

  const { results } = await c.env.DB.prepare(`
    SELECT a.* FROM merchant_approvals a
    WHERE a.submitted_by_merchant_id = ?
    ORDER BY a.submitted_at DESC
  `).bind(merchant.id).all();

  return c.json({ approvals: results || [] });
});

/** POST /api/merchant/approvals/:id/approve */
app.post('/:id/approve', async (c) => {
  const userId = c.get('userId');
  const approvalId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ note?: string }>().catch(() => ({}));

  const approval = await c.env.DB.prepare(
    "SELECT * FROM merchant_approvals WHERE id = ? AND status = 'pending'"
  ).bind(approvalId).first<any>();
  if (!approval) return c.json({ error: 'Approval not found or not pending' }, 404);

  const rel = await c.env.DB.prepare(
    'SELECT * FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(approval.relationship_id, merchant.id, merchant.id).first<any>();
  if (!rel) return c.json({ error: 'Forbidden' }, 403);
  if (approval.submitted_by_merchant_id === merchant.id) {
    return c.json({ error: 'Cannot approve your own request' }, 403);
  }

  const now = new Date().toISOString();
  const payload = approval.proposed_payload ? JSON.parse(approval.proposed_payload) : {};

  try {
    switch (approval.type) {
      case 'settlement_submit': {
        await c.env.DB.prepare("UPDATE merchant_settlements SET status = 'approved' WHERE id = ?")
          .bind(approval.target_entity_id).run();
        const sett = await c.env.DB.prepare('SELECT * FROM merchant_settlements WHERE id = ?').bind(approval.target_entity_id).first<any>();
        if (sett) {
          await c.env.DB.prepare("UPDATE merchant_deals SET status = 'settled', close_date = ?, realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = ? WHERE id = ?")
            .bind(now, sett.paid_amount, now, sett.deal_id).run();
        }
        break;
      }
      case 'profit_record_submit': {
        await c.env.DB.prepare("UPDATE merchant_profit_records SET status = 'approved' WHERE id = ?")
          .bind(approval.target_entity_id).run();
        const prof = await c.env.DB.prepare('SELECT * FROM merchant_profit_records WHERE id = ?').bind(approval.target_entity_id).first<any>();
        if (prof) {
          await c.env.DB.prepare("UPDATE merchant_deals SET realized_pnl = COALESCE(realized_pnl, 0) + ?, updated_at = ? WHERE id = ?")
            .bind(prof.net_distributable, now, prof.deal_id).run();
        }
        break;
      }
      case 'deal_close': {
        await c.env.DB.prepare("UPDATE merchant_deals SET status = 'closed', close_date = ?, realized_pnl = COALESCE(?, realized_pnl), updated_at = ? WHERE id = ?")
          .bind(now, payload.realized_pnl, now, approval.target_entity_id).run();
        break;
      }
      case 'relationship_suspend': {
        await c.env.DB.prepare("UPDATE merchant_relationships SET status = 'suspended', updated_at = ? WHERE id = ?")
          .bind(now, approval.relationship_id).run();
        break;
      }
      case 'relationship_terminate': {
        await c.env.DB.prepare("UPDATE merchant_relationships SET status = 'terminated', updated_at = ? WHERE id = ?")
          .bind(now, approval.relationship_id).run();
        break;
      }
      case 'capital_adjustment': {
        if (payload.new_amount != null) {
          await c.env.DB.prepare("UPDATE merchant_deals SET amount = ?, updated_at = ? WHERE id = ?")
            .bind(payload.new_amount, now, approval.target_entity_id).run();
        }
        break;
      }
    }
  } catch (err: any) {
    return c.json({ error: `Mutation failed: ${err.message}` }, 500);
  }

  await c.env.DB.prepare(
    "UPDATE merchant_approvals SET status = 'approved', resolution_note = ?, resolved_at = ? WHERE id = ?"
  ).bind((body as any).note || null, now, approvalId).run();

  // Notify submitter
  const submitterProfile = await c.env.DB.prepare('SELECT owner_user_id FROM merchant_profiles WHERE id = ?')
    .bind(approval.submitted_by_merchant_id).first<any>();
  if (submitterProfile) {
    await c.env.DB.prepare(`
      INSERT INTO merchant_notifications (id, user_id, merchant_id, category, title, body, link_type, link_id, created_at)
      VALUES (?, ?, ?, 'approval', ?, ?, 'approval', ?, ?)
    `).bind(crypto.randomUUID(), submitterProfile.owner_user_id, approval.submitted_by_merchant_id,
      `Your ${approval.type} request was approved`, (body as any).note || 'Approved by counterparty',
      approvalId, now).run();
  }

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, before_state, after_state, note, created_at)
    VALUES (?, ?, ?, 'approval', ?, 'approve', ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, approvalId,
    JSON.stringify({ status: 'pending' }), JSON.stringify({ status: 'approved', type: approval.type }),
    (body as any).note || null, now).run();

  // System message
  await c.env.DB.prepare(`
    INSERT INTO merchant_messages (id, relationship_id, sender_user_id, sender_merchant_id, message_type, body, created_at)
    VALUES (?, ?, ?, ?, 'system', ?, ?)
  `).bind(crypto.randomUUID(), approval.relationship_id, userId, merchant.id,
    `✅ ${approval.type} approved by ${merchant.display_name}`, now).run();

  return c.json({ ok: true, type: approval.type });
});

/** POST /api/merchant/approvals/:id/reject */
app.post('/:id/reject', async (c) => {
  const userId = c.get('userId');
  const approvalId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ error: 'No merchant profile' }, 403);

  const body = await c.req.json<{ note?: string }>().catch(() => ({}));
  const now = new Date().toISOString();

  const approval = await c.env.DB.prepare(
    "SELECT * FROM merchant_approvals WHERE id = ? AND status = 'pending'"
  ).bind(approvalId).first<any>();
  if (!approval) return c.json({ error: 'Not found' }, 404);

  if (approval.type === 'settlement_submit') {
    await c.env.DB.prepare("UPDATE merchant_settlements SET status = 'rejected' WHERE id = ?")
      .bind(approval.target_entity_id).run();
  } else if (approval.type === 'profit_record_submit') {
    await c.env.DB.prepare("UPDATE merchant_profit_records SET status = 'rejected' WHERE id = ?")
      .bind(approval.target_entity_id).run();
  }

  await c.env.DB.prepare(
    "UPDATE merchant_approvals SET status = 'rejected', resolution_note = ?, resolved_at = ? WHERE id = ?"
  ).bind((body as any).note || null, now, approvalId).run();

  await c.env.DB.prepare(`
    INSERT INTO merchant_audit_logs (id, actor_user_id, actor_merchant_id, entity_type, entity_id, action, note, created_at)
    VALUES (?, ?, ?, 'approval', ?, 'reject', ?, ?)
  `).bind(crypto.randomUUID(), userId, merchant.id, approvalId, (body as any).note || null, now).run();

  return c.json({ ok: true });
});

export default app;
```

### 7.7 Audit

**File: `backend/src/routes/merchant-audit.ts`**
**Mount point: `/api/merchant/audit`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/relationship/:id` | Audit logs for a relationship (deals, approvals, settlements) |
| GET | `/activity` | My personal activity log |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

async function getMerchantForUser(db: D1Database, userId: string) {
  return db.prepare('SELECT * FROM merchant_profiles WHERE owner_user_id = ?').bind(userId).first<any>();
}

/** GET /api/merchant/audit/relationship/:id */
app.get('/relationship/:id', async (c) => {
  const userId = c.get('userId');
  const relId = c.req.param('id');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ logs: [] });

  const access = await c.env.DB.prepare(
    'SELECT id FROM merchant_relationships WHERE id = ? AND (merchant_a_id = ? OR merchant_b_id = ?)'
  ).bind(relId, merchant.id, merchant.id).first();
  if (!access) return c.json({ error: 'Forbidden' }, 403);

  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const { results } = await c.env.DB.prepare(`
    SELECT al.*, mp.display_name AS actor_name
    FROM merchant_audit_logs al
    LEFT JOIN merchant_profiles mp ON mp.id = al.actor_merchant_id
    WHERE al.entity_id IN (
      SELECT id FROM merchant_deals WHERE relationship_id = ?
      UNION SELECT id FROM merchant_approvals WHERE relationship_id = ?
      UNION SELECT id FROM merchant_settlements WHERE relationship_id = ?
      UNION SELECT ?
    )
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(relId, relId, relId, relId, limit, offset).all();

  return c.json({ logs: results || [] });
});

/** GET /api/merchant/audit/activity */
app.get('/activity', async (c) => {
  const userId = c.get('userId');
  const merchant = await getMerchantForUser(c.env.DB, userId);
  if (!merchant) return c.json({ logs: [] });

  const limit = parseInt(c.req.query('limit') || '50');

  const { results } = await c.env.DB.prepare(`
    SELECT al.*, mp.display_name AS actor_name
    FROM merchant_audit_logs al
    LEFT JOIN merchant_profiles mp ON mp.id = al.actor_merchant_id
    WHERE al.actor_user_id = ? OR al.actor_merchant_id = ?
    ORDER BY al.created_at DESC
    LIMIT ?
  `).bind(userId, merchant.id, limit).all();

  return c.json({ logs: results || [] });
});

export default app;
```

### 7.8 Notifications

**File: `backend/src/routes/merchant-notifications.ts`**
**Mount point: `/api/merchant/notifications`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/?limit=&unread=` | List notifications |
| GET | `/count` | Unread count |
| POST | `/:id/read` | Mark one as read |
| POST | `/read-all` | Mark all as read |

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();
app.use('/*', authMiddleware);

/** GET /api/merchant/notifications */
app.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '50');
  const unreadOnly = c.req.query('unread') === '1';

  let query = `SELECT * FROM merchant_notifications WHERE user_id = ?`;
  if (unreadOnly) query += ` AND read_at IS NULL`;
  query += ` ORDER BY created_at DESC LIMIT ?`;

  const { results } = await c.env.DB.prepare(query).bind(userId, limit).all();
  return c.json({ notifications: results || [] });
});

/** GET /api/merchant/notifications/count */
app.get('/count', async (c) => {
  const userId = c.get('userId');
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM merchant_notifications WHERE user_id = ? AND read_at IS NULL'
  ).bind(userId).first<any>();
  return c.json({ unread: row?.cnt || 0 });
});

/** POST /api/merchant/notifications/:id/read */
app.post('/:id/read', async (c) => {
  const userId = c.get('userId');
  const nId = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE merchant_notifications SET read_at = ? WHERE id = ? AND user_id = ?"
  ).bind(new Date().toISOString(), nId, userId).run();
  return c.json({ ok: true });
});

/** POST /api/merchant/notifications/read-all */
app.post('/read-all', async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare(
    "UPDATE merchant_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL"
  ).bind(new Date().toISOString(), userId).run();
  return c.json({ ok: true });
});

export default app;
```

---

## 8. Route Wiring

**File: `backend/src/index.ts`**

```typescript
import { Hono } from "hono";
import type { Env } from "./types";
import { corsMiddleware } from "./middleware/cors";
import merchantProfilesRoute from "./routes/merchant-profiles";
import merchantInvitesRoute from "./routes/merchant-invites";
import merchantRelationshipsRoute from "./routes/merchant-relationships";
import merchantDealsRoute from "./routes/merchant-deals";
import merchantMessagesRoute from "./routes/merchant-messages";
import merchantApprovalsRoute from "./routes/merchant-approvals";
import merchantAuditRoute from "./routes/merchant-audit";
import merchantNotificationsRoute from "./routes/merchant-notifications";

const app = new Hono<{ Bindings: Env }>();

app.use("*", corsMiddleware);

// Merchant routes
app.route("/api/merchant", merchantProfilesRoute);
app.route("/api/merchant/invites", merchantInvitesRoute);
app.route("/api/merchant/relationships", merchantRelationshipsRoute);
app.route("/api/merchant/deals", merchantDealsRoute);
app.route("/api/merchant/messages", merchantMessagesRoute);
app.route("/api/merchant/approvals", merchantApprovalsRoute);
app.route("/api/merchant/audit", merchantAuditRoute);
app.route("/api/merchant/notifications", merchantNotificationsRoute);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default { fetch: app.fetch };
```

### Complete API Route Map

| Mount Point | Route File | Endpoints |
|-------------|-----------|-----------|
| `/api/merchant` | merchant-profiles | `/profile/me`, `/profile`, `/profile/:id`, `/search`, `/check-nickname` |
| `/api/merchant/invites` | merchant-invites | `/`, `/inbox`, `/sent`, `/:id/accept`, `/:id/reject`, `/:id/withdraw` |
| `/api/merchant/relationships` | merchant-relationships | `/`, `/:id`, `/:id/settings`, `/:id/suspend`, `/:id/terminate` |
| `/api/merchant/deals` | merchant-deals | `/`, `/:id`, `/:id/submit-settlement`, `/:id/record-profit`, `/:id/close` |
| `/api/merchant/messages` | merchant-messages | `/:relId/messages`, `/mark-read/:id` |
| `/api/merchant/approvals` | merchant-approvals | `/inbox`, `/sent`, `/:id/approve`, `/:id/reject` |
| `/api/merchant/audit` | merchant-audit | `/relationship/:id`, `/activity` |
| `/api/merchant/notifications` | merchant-notifications | `/`, `/count`, `/:id/read`, `/read-all` |

---

## 9. Frontend API Client

**File: `src/lib/merchantApi.ts`**

This is a thin typed wrapper around `fetch` that:
1. Gets Clerk session token via `window.Clerk.session.getToken()`
2. Prepends `VITE_WORKER_API_URL` to all paths
3. Adds `Authorization: Bearer <token>` header
4. Throws on non-OK responses with the error body

```typescript
const WORKER_BASE = import.meta.env.VITE_WORKER_API_URL || "";

async function getAuthToken(): Promise<string | null> {
  try {
    return (await (window as any).Clerk?.session?.getToken()) || null;
  } catch { return null; }
}

async function mFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Profile ──
export interface MerchantProfile {
  id: string; owner_user_id: string; merchant_id: string; nickname: string;
  display_name: string; merchant_type: string; region: string | null;
  default_currency: string; discoverability: string; bio: string | null;
  status: string; created_at: string; updated_at: string;
}

export const fetchMyProfile = () => mFetch<{ profile: MerchantProfile | null }>("/api/merchant/profile/me");
export const createProfile = (data: {
  nickname: string; display_name: string; merchant_type?: string;
  region?: string; default_currency?: string; discoverability?: string; bio?: string;
}) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile", { method: "POST", body: JSON.stringify(data) });
export const updateProfile = (data: Partial<{
  display_name: string; merchant_type: string; region: string;
  default_currency: string; discoverability: string; bio: string;
}>) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile/me", { method: "PATCH", body: JSON.stringify(data) });
export const fetchProfile = (merchantId: string) =>
  mFetch<{ profile: MerchantProfile }>(`/api/merchant/profile/${merchantId}`);
export const searchMerchants = (q: string) =>
  mFetch<{ results: MerchantProfile[] }>(`/api/merchant/search?q=${encodeURIComponent(q)}`);
export const checkNickname = (nickname: string) =>
  mFetch<{ available: boolean }>(`/api/merchant/check-nickname?nickname=${encodeURIComponent(nickname)}`);

// ── Invites ──
export interface MerchantInvite {
  id: string; from_merchant_id: string; to_merchant_id: string;
  status: string; purpose: string | null; requested_role: string;
  message: string | null; requested_scope: string | null;
  expires_at: string | null; created_at: string; updated_at: string;
  from_display_name?: string; from_nickname?: string; from_merchant_code?: string;
  to_display_name?: string; to_nickname?: string; to_merchant_code?: string;
}

export const sendInvite = (data: {
  to_merchant_id: string; purpose?: string; requested_role?: string;
  message?: string; requested_scope?: string[];
}) => mFetch<{ invite: MerchantInvite }>("/api/merchant/invites", { method: "POST", body: JSON.stringify(data) });
export const fetchInbox = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/inbox");
export const fetchSentInvites = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/sent");
export const acceptInvite = (id: string) => mFetch<{ relationship_id: string }>(`/api/merchant/invites/${id}/accept`, { method: "POST", body: "{}" });
export const rejectInvite = (id: string, reason?: string) => mFetch(`/api/merchant/invites/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
export const withdrawInvite = (id: string) => mFetch(`/api/merchant/invites/${id}/withdraw`, { method: "POST", body: "{}" });

// ── Relationships ──
export interface MerchantRelationship {
  id: string; merchant_a_id: string; merchant_b_id: string;
  relationship_type: string; status: string;
  a_display_name?: string; a_nickname?: string; a_merchant_code?: string;
  b_display_name?: string; b_nickname?: string; b_merchant_code?: string;
  my_role?: string; created_at: string; updated_at: string;
}

export const fetchRelationships = () => mFetch<{ relationships: MerchantRelationship[] }>("/api/merchant/relationships");
export const fetchRelationship = (id: string) => mFetch<{
  relationship: MerchantRelationship; roles: any[]; summary: {
    totalDeals: number; activeExposure: number; realizedProfit: number; pendingApprovals: number;
  };
}>(`/api/merchant/relationships/${id}`);
export const updateRelSettings = (id: string, data: any) =>
  mFetch(`/api/merchant/relationships/${id}/settings`, { method: "PATCH", body: JSON.stringify(data) });
export const suspendRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/suspend`, { method: "POST", body: "{}" });
export const terminateRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/terminate`, { method: "POST", body: "{}" });

// ── Deals ──
export interface MerchantDeal {
  id: string; relationship_id: string; deal_type: string; title: string;
  amount: number; currency: string; status: string; metadata: string | null;
  issue_date: string | null; due_date: string | null; close_date: string | null;
  expected_return: number | null; realized_pnl: number | null;
  created_by: string; created_at: string; updated_at: string;
}

export const fetchDeals = (relId?: string) =>
  mFetch<{ deals: MerchantDeal[] }>(`/api/merchant/deals${relId ? `?relationship_id=${relId}` : ""}`);
export const createDeal = (data: {
  relationship_id: string; deal_type: string; title: string; amount: number;
  currency?: string; issue_date?: string; due_date?: string; expected_return?: number;
}) => mFetch<{ deal: MerchantDeal }>("/api/merchant/deals", { method: "POST", body: JSON.stringify(data) });
export const updateDeal = (id: string, data: Partial<MerchantDeal>) =>
  mFetch<{ deal: MerchantDeal }>(`/api/merchant/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const submitSettlement = (dealId: string, data: { paid_amount: number; paid_date: string; variance_note?: string }) =>
  mFetch<{ settlement_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/submit-settlement`, { method: "POST", body: JSON.stringify(data) });
export const recordProfit = (dealId: string, data: {
  period: string; gross_profit: number; net_distributable: number;
  share_a?: number; share_b?: number; note?: string;
}) => mFetch<{ profit_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/record-profit`, { method: "POST", body: JSON.stringify(data) });
export const closeDeal = (dealId: string, data?: { realized_pnl?: number; note?: string }) =>
  mFetch<{ approval_id: string }>(`/api/merchant/deals/${dealId}/close`, { method: "POST", body: JSON.stringify(data || {}) });

// ── Messages ──
export interface MerchantMessage {
  id: string; relationship_id: string; sender_user_id: string;
  sender_merchant_id: string; message_type: string; body: string;
  sender_name?: string; sender_nickname?: string;
  read_by: string | null; created_at: string;
}

export const fetchMessages = (relId: string, limit = 50, offset = 0) =>
  mFetch<{ messages: MerchantMessage[] }>(`/api/merchant/messages/${relId}/messages?limit=${limit}&offset=${offset}`);
export const sendMessage = (relId: string, body: string) =>
  mFetch<{ message: MerchantMessage }>(`/api/merchant/messages/${relId}/messages`, { method: "POST", body: JSON.stringify({ body }) });

// ── Approvals ──
export interface MerchantApproval {
  id: string; relationship_id: string; type: string;
  target_entity_type: string | null; target_entity_id: string | null;
  proposed_payload: string | null; status: string;
  submitted_by_user_id: string; submitted_by_merchant_id: string;
  submitter_name?: string; submitter_nickname?: string;
  resolution_note: string | null; submitted_at: string; resolved_at: string | null;
}

export const fetchApprovalInbox = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/inbox");
export const fetchSentApprovals = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/sent");
export const approveRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
export const rejectRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });

// ── Audit ──
export interface AuditLog {
  id: string; actor_user_id: string; actor_merchant_id: string | null;
  entity_type: string; entity_id: string; action: string;
  before_state: string | null; after_state: string | null;
  note: string | null; actor_name?: string; created_at: string;
}

export const fetchRelAudit = (relId: string) =>
  mFetch<{ logs: AuditLog[] }>(`/api/merchant/audit/relationship/${relId}`);
export const fetchMyActivity = () =>
  mFetch<{ logs: AuditLog[] }>("/api/merchant/audit/activity");

// ── Notifications ──
export interface MerchantNotification {
  id: string; user_id: string; merchant_id: string | null;
  category: string; title: string; body: string | null;
  link_type: string | null; link_id: string | null;
  read_at: string | null; created_at: string;
}

export const fetchNotifications = (limit = 50) =>
  mFetch<{ notifications: MerchantNotification[] }>(`/api/merchant/notifications?limit=${limit}`);
export const fetchUnreadCount = () =>
  mFetch<{ unread: number }>("/api/merchant/notifications/count");
export const markNotificationRead = (id: string) =>
  mFetch(`/api/merchant/notifications/${id}/read`, { method: "POST", body: "{}" });
export const markAllRead = () =>
  mFetch("/api/merchant/notifications/read-all", { method: "POST", body: "{}" });
```

---

## 10. Frontend UI Page

**File: `src/pages/MerchantPage.tsx`** (~845 lines)

The page is a single-file component with these sub-components:

| Component | Purpose |
|-----------|---------|
| `MerchantOnboarding` | Create profile form with nickname validation |
| `OverviewTab` | Dashboard with stat cards |
| `DirectoryTab` | Search merchants + send invite modal |
| `InvitesTab` | Inbox/Sent with accept/reject/withdraw |
| `RelationshipsTab` | List relationships, click to open workspace |
| `RelationshipWorkspace` | Full workspace: overview, deals, messages, audit |
| `ApprovalsTab` | Inbox/sent approvals with approve/reject |
| `NotificationsTab` | List with mark read |
| `MerchantSettingsTab` | Edit profile fields |
| `AuditTab` | Activity log |
| `MerchantPage` (default export) | Orchestrator with tab bar + data loading |

### UI Patterns Used

- **CSS variables**: `var(--panel)`, `var(--line)`, `var(--text)`, `var(--muted)`, `var(--brand)`, `var(--good)`, `var(--warn)`
- **CSS classes**: `.inputBox`, `.btn.primary`, `.btn.secondary`
- **No component library** for merchant UI — all inline styles
- **Polling**: Unread count polled every 15 seconds
- **State**: All `useState` — no external state management

### Page Flow

```
isSignedIn? ──no──▶ (nothing shown)
     │
    yes
     │
 loadAll() ─── fetchMyProfile()
     │              │
     │         profile null?
     │              │
     │         yes: show MerchantOnboarding
     │              │
     │         no: load relationships, deals, unread count
     │              │
     │         selectedRelId set?
     │              │
     │         yes: show RelationshipWorkspace
     │              │
     │         no: show tab bar + selected tab content
```

> **Note**: The complete 845-line source is in `src/pages/MerchantPage.tsx`. It is included in the sections above as reference for each sub-component.

---

## 11. Wrangler Configuration

**File: `backend/wrangler.toml`**

```toml
name = "cryptotracker-api"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[vars]
ALLOWED_ORIGINS = "http://localhost:3000,https://your-frontend.pages.dev"

[[d1_databases]]
binding = "DB"
database_name = "crypto-tracker"
database_id = "<your-d1-database-id>"

[[kv_namespaces]]
binding = "PRICE_KV"
id = "<your-kv-namespace-id>"
```

### Required Secrets

```bash
wrangler secret put CLERK_JWKS_URL
# Enter: https://<your-clerk-domain>/.well-known/jwks.json
```

### Required Environment Variables (Frontend)

```
VITE_WORKER_API_URL=https://your-worker.workers.dev
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

---

## 12. Deployment

### Backend

```bash
cd backend
npm install
wrangler d1 execute crypto-tracker --remote --file=../seed/merchant-schema.sql
wrangler deploy
```

### Frontend

```bash
npm install
npm run build
# Deploy dist/ to Cloudflare Pages, Vercel, or any static host
```

---

## 13. End-to-End Flows

### Flow 1: Onboarding
1. User signs in with Clerk
2. `fetchMyProfile()` returns `null`
3. User fills onboarding form (display name, nickname, type, region, bio, discoverability)
4. Frontend calls `createProfile()` → POST `/api/merchant/profile`
5. Backend validates nickname format + uniqueness, generates `MRC-XXXXXXXX` ID
6. Profile created, page reloads to Overview

### Flow 2: Discovery → Invite → Relationship
1. User A searches Directory: `searchMerchants("taheito")` → GET `/api/merchant/search?q=taheito`
2. User A sends invite: `sendInvite({ to_merchant_id, purpose, message })` → POST `/api/merchant/invites`
3. User B sees invite in Inbox: `fetchInbox()` → GET `/api/merchant/invites/inbox`
4. User B accepts: `acceptInvite(id)` → POST `/api/merchant/invites/:id/accept`
5. Backend creates: relationship, roles (owner + operator), system message, notification, audit log
6. Both users see relationship in Relationships tab

### Flow 3: Deal → Settlement → Approval
1. User opens Relationship Workspace → Deals tab
2. Creates deal: `createDeal({ relationship_id, deal_type, title, amount })` → POST `/api/merchant/deals`
3. Activates deal: `updateDeal(id, { status: 'active' })` → PATCH `/api/merchant/deals/:id`
4. Submits settlement: `submitSettlement(dealId, { paid_amount, paid_date })` → POST `/api/merchant/deals/:id/submit-settlement`
5. Backend creates `merchant_settlements` + `merchant_approvals` (pending)
6. Counterparty sees in Approvals Inbox
7. Counterparty approves: `approveRequest(id)` → POST `/api/merchant/approvals/:id/approve`
8. Backend: settlement → approved, deal → settled, realized_pnl updated, notification + system message + audit log created

### Flow 4: Relationship Lifecycle
- **Suspend**: POST `/api/merchant/relationships/:id/suspend` → status = 'suspended'
- **Terminate**: POST `/api/merchant/relationships/:id/terminate` → status = 'terminated'
- Both create audit logs

---

## File Map

```
backend/
├── src/
│   ├── index.ts                          # Route wiring + exports
│   ├── types.ts                          # Env interface
│   ├── middleware/
│   │   ├── auth.ts                       # Clerk JWT RS256 verification
│   │   └── cors.ts                       # CORS with Lovable domain support
│   └── routes/
│       ├── merchant-profiles.ts          # Profile CRUD + search + nickname check
│       ├── merchant-invites.ts           # Invite lifecycle (create/accept/reject/withdraw)
│       ├── merchant-relationships.ts     # Relationship CRUD + suspend/terminate
│       ├── merchant-deals.ts             # Deal CRUD + settlement/profit/close
│       ├── merchant-messages.ts          # Messaging + read receipts
│       ├── merchant-approvals.ts         # Approval inbox + approve/reject with mutations
│       ├── merchant-audit.ts             # Audit log queries
│       └── merchant-notifications.ts     # Notification CRUD + unread count
├── wrangler.toml                         # Cloudflare Worker config
└── package.json

seed/
└── merchant-schema.sql                   # D1 schema (12 tables)

src/
├── lib/
│   └── merchantApi.ts                    # Typed frontend API client
└── pages/
    └── MerchantPage.tsx                  # Full UI (845 lines, 10 tabs)
```
