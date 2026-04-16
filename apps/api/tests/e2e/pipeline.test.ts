/**
 * E2E pipeline test — exercises the full notification flow:
 *   register tenant → send notification → poll for delivery →
 *   verify status → engagement tracking → tenant isolation
 *
 * Mocks: pg pool (stateful in-memory), BullMQ queue, logger.
 * Real:  Express app, all route handlers, auth middleware.
 */
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';

// ── Stateful in-memory database ──

interface TenantRow { id: string; name: string; slug: string; created_at: string }
interface ApiKeyRow { id: string; tenant_id: string; key_hash: string; key_prefix: string; scopes: string; last_used_at: string | null; revoked_at: string | null; expires_at: string | null }
interface NotificationRow { id: string; tenant_id: string; idempotency_key: string | null; recipient: string; subject: string | null; body: string; body_html: string | null; priority: string; routing_mode: string; channel_preference: string[] | null; force_channel: string | null; metadata: string; status: string; delivered_via: string | null; delivered_at: string | null; failed_at: string | null; routing_decision: string | null; created_at: string; updated_at: string }
interface DeliveryAttemptRow { notification_id: string; channel_type: string; attempt_number: number; status: string; status_code: number | null; error_message: string | null; engaged: boolean | null; engagement_type: string | null; engaged_at: string | null; started_at: string; completed_at: string; duration_ms: number }
interface ChannelRow { id: string; type: string; label: string; config: string; circuit_state: string; priority: number }

const db = {
  tenants: [] as TenantRow[],
  apiKeys: [] as ApiKeyRow[],
  notifications: [] as NotificationRow[],
  deliveryAttempts: [] as DeliveryAttemptRow[],
  channels: [] as ChannelRow[],
};

function resetDb() {
  db.tenants = [];
  db.apiKeys = [];
  db.notifications = [];
  db.deliveryAttempts = [];
  db.channels = [];
}

// Mock client returned by pool.connect() — handles transactional and RLS queries
function createMockClient(currentTenantId: { value: string }) {
  const client = {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      return handleQuery(sql, params, currentTenantId);
    }),
    release: vi.fn(),
  };
  return client;
}

function handleQuery(sql: string, params: unknown[] | undefined, tenantCtx: { value: string }) {
  const p = params ?? [];

  // RLS context
  if (sql.includes('set_config')) {
    tenantCtx.value = (p[0] as string) || '';
    return Promise.resolve({ rows: [] });
  }

  // BEGIN / COMMIT / ROLLBACK
  if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim())) {
    return Promise.resolve({ rows: [] });
  }

  // Tenant slug duplicate check
  if (sql.includes('SELECT id FROM tenants WHERE slug')) {
    const slug = p[0] as string;
    const found = db.tenants.filter(t => t.slug === slug);
    return Promise.resolve({ rows: found });
  }

  // Insert tenant
  if (sql.includes('INSERT INTO tenants')) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row: TenantRow = { id, name: p[0] as string, slug: p[1] as string, created_at: now };
    db.tenants.push(row);
    return Promise.resolve({ rows: [row] });
  }

  // Insert API key
  if (sql.includes('INSERT INTO api_keys')) {
    const id = crypto.randomUUID();
    const row: ApiKeyRow = {
      id,
      tenant_id: p[0] as string,
      key_hash: p[1] as string,
      key_prefix: p[2] as string,
      scopes: p[4] as string,
      last_used_at: null,
      revoked_at: null,
      expires_at: null,
    };
    db.apiKeys.push(row);
    return Promise.resolve({ rows: [] });
  }

  // Insert channels (bulk insert for default channels)
  if (sql.includes('INSERT INTO channels')) {
    const tenantId = p[0] as string;
    const types = ['email', 'websocket', 'webhook'];
    for (const type of types) {
      db.channels.push({
        id: crypto.randomUUID(),
        type,
        label: type,
        config: '{}',
        circuit_state: 'closed',
        priority: type === 'email' ? 10 : type === 'websocket' ? 5 : 1,
      });
    }
    return Promise.resolve({ rows: [] });
  }

  // Auth: lookup API key by hash
  if (sql.includes('FROM api_keys') && sql.includes('key_hash')) {
    const hash = p[0] as string;
    const found = db.apiKeys.find(k => k.key_hash === hash && !k.revoked_at);
    if (found) {
      return Promise.resolve({
        rows: [{
          id: found.id,
          tenant_id: found.tenant_id,
          key_hash: found.key_hash,
          scopes: ['notifications:write', 'notifications:read'],
        }],
      });
    }
    return Promise.resolve({ rows: [] });
  }

  // Update last_used_at on api_keys (fire-and-forget from auth)
  if (sql.includes('UPDATE api_keys SET last_used_at')) {
    return Promise.resolve({ rows: [] });
  }

  // Insert notification
  if (sql.includes('INSERT INTO notifications')) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row: NotificationRow = {
      id,
      tenant_id: tenantCtx.value || (p[0] as string),
      idempotency_key: p[1] as string | null,
      recipient: p[2] as string,
      subject: p[3] as string | null,
      body: p[4] as string,
      body_html: p[5] as string | null,
      priority: p[6] as string,
      routing_mode: p[7] as string,
      channel_preference: p[8] as string[] | null,
      force_channel: p[9] as string | null,
      metadata: (p[10] as string) || '{}',
      status: 'pending',
      delivered_via: null,
      delivered_at: null,
      failed_at: null,
      routing_decision: null,
      created_at: now,
      updated_at: now,
    };
    db.notifications.push(row);
    return Promise.resolve({ rows: [{ id: row.id, created_at: row.created_at }] });
  }

  // Update notification status to queued
  if (sql.includes("status = 'queued'") && sql.includes('UPDATE notifications')) {
    const nid = p[0] as string;
    const n = db.notifications.find(n => n.id === nid);
    if (n) {
      n.status = 'queued';
      n.updated_at = new Date().toISOString();
      // Simulate worker delivering it after a brief delay
      setTimeout(() => {
        n.status = 'delivered';
        n.delivered_via = 'email';
        n.delivered_at = new Date().toISOString();
        n.updated_at = new Date().toISOString();
        db.deliveryAttempts.push({
          notification_id: n.id,
          channel_type: 'email',
          attempt_number: 1,
          status: 'success',
          status_code: 200,
          error_message: null,
          engaged: null,
          engagement_type: null,
          engaged_at: null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: 120,
        });
      }, 100);
    }
    return Promise.resolve({ rows: [] });
  }

  // GET notification by ID
  if (sql.includes('FROM notifications') && sql.includes('WHERE id = $1') && !sql.includes('UPDATE') && !sql.includes('INSERT')) {
    const id = p[0] as string;
    const row = db.notifications.find(n => n.id === id);
    return Promise.resolve({ rows: row ? [row] : [] });
  }

  // GET delivery attempts for a notification
  if (sql.includes('FROM delivery_attempts') && sql.includes('notification_id')) {
    const nid = p[0] as string;
    const rows = db.deliveryAttempts.filter(a => a.notification_id === nid);
    return Promise.resolve({ rows });
  }

  // GET notifications list (paginated)
  if (sql.includes('FROM notifications') && sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT')) {
    const tid = p[0] as string;
    const rows = db.notifications
      .filter(n => n.tenant_id === tid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.resolve({ rows });
  }

  // GET notification summary
  if (sql.includes('COUNT(*)') && sql.includes('FROM notifications')) {
    const tid = p[0] as string;
    const tenantNotifs = db.notifications.filter(n => n.tenant_id === tid);
    return Promise.resolve({
      rows: [{
        total: tenantNotifs.length,
        delivered: tenantNotifs.filter(n => n.status === 'delivered').length,
        failed: tenantNotifs.filter(n => n.status === 'failed').length,
        queued: tenantNotifs.filter(n => n.status === 'queued').length,
        processing: tenantNotifs.filter(n => n.status === 'processing').length,
      }],
    });
  }

  // Engagement tracking: update delivery_attempts
  if (sql.includes('UPDATE delivery_attempts') && sql.includes('engaged')) {
    const nid = p[0] as string;
    for (const a of db.deliveryAttempts) {
      if (a.notification_id === nid && !a.engaged) {
        a.engaged = true;
        a.engaged_at = new Date().toISOString();
        a.engagement_type = 'email_open';
      }
    }
    return Promise.resolve({ rows: [] });
  }

  // SECURITY DEFINER tenant lookup for engagement tracking pixel
  if (sql.includes('get_tenant_for_notification')) {
    const id = p[0] as string;
    const n = db.notifications.find(n => n.id === id);
    return Promise.resolve({ rows: [{ tenant_id: n?.tenant_id ?? null }] });
  }

  // Engagement detail lookup: recipient + channel under tenant RLS
  if (sql.includes('FROM notifications n') && sql.includes('JOIN delivery_attempts')) {
    const id = p[0] as string;
    const n = db.notifications.find(n => n.id === id);
    const da = db.deliveryAttempts.find(a => a.notification_id === id);
    if (!n || !da) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [{ recipient: n.recipient, channel_type: da.channel_type }] });
  }

  // Fallback
  return Promise.resolve({ rows: [] });
}

// ── Hoisted mocks ──

const { mockPoolQuery, mockPoolConnect, mockQueueAdd } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockPoolConnect: vi.fn(),
  mockQueueAdd: vi.fn().mockResolvedValue({}),
}));

const sharedTenantCtx = { value: '' };

vi.mock('../../src/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => handleQuery(args[0] as string, args[1] as unknown[], sharedTenantCtx),
    connect: () => Promise.resolve(createMockClient(sharedTenantCtx)),
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/queue.js', () => ({
  getNotificationQueue: () => ({ add: mockQueueAdd }),
}));

// ── Build Express app with real routes + real auth ──

import { authMiddleware } from '../../src/middleware/auth.js';
import { tenantRouter } from '../../src/routes/tenants.js';
import { notificationRouter } from '../../src/routes/notifications.js';
import { engagementRouter } from '../../src/routes/engagement.js';

const app = express();
app.use(express.json());
app.use('/v1/tenants', tenantRouter);
app.use('/v1/engagement', engagementRouter);
app.use('/v1/notifications', authMiddleware, notificationRouter);

let server: ReturnType<typeof app.listen>;
let port: number;

beforeAll(async () => {
  resetDb();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') port = addr.port;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

// ── Helpers ──

function url(path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(url(path), { headers });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Pipeline test ──

describe('E2E: full notification pipeline', () => {
  let apiKey1 = '';
  let tenantId1 = '';
  let notifId = '';
  let apiKey2 = '';

  it('Test 1: register a tenant — returns 201 with api_key', async () => {
    const ts = Date.now();
    const res = await post('/v1/tenants/register', {
      company_name: `E2E Test Corp ${ts}`,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;

    expect(body.tenant_id).toBeDefined();
    expect(typeof body.tenant_id).toBe('string');
    expect(body.api_key).toBeDefined();
    expect((body.api_key as string).startsWith('ne_test_')).toBe(true);
    expect(body.company_name).toBe(`E2E Test Corp ${ts}`);
    expect(body.slug).toBeDefined();
    expect(body.message).toBeDefined();
    expect(body.created_at).toBeDefined();
    expect(body.request_id).toBeDefined();

    apiKey1 = body.api_key as string;
    tenantId1 = body.tenant_id as string;
  });

  it('Test 2: send a notification — returns 202 with id', async () => {
    const res = await post('/v1/notifications', {
      recipient: 'test@example.com',
      subject: 'E2E test notification',
      body: 'This is a pipeline test.',
      priority: 'high',
      routing_mode: 'static',
    }, { authorization: `Bearer ${apiKey1}` });

    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;

    expect(body.id).toBeDefined();
    expect(body.status).toBe('queued');
    expect(body.priority).toBe('high');
    expect(body.routing_mode).toBe('static');
    expect(body.status_url).toBe(`/v1/notifications/${body.id}`);
    expect(body.created_at).toBeDefined();
    expect(body.request_id).toBeDefined();

    notifId = body.id as string;
  });

  it('Test 3: poll until delivered — status transitions to delivered', async () => {
    let status = '';
    let body: Record<string, unknown> = {};

    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const res = await get(`/v1/notifications/${notifId}`, {
        authorization: `Bearer ${apiKey1}`,
      });
      expect(res.status).toBe(200);
      body = await res.json() as Record<string, unknown>;
      status = body.status as string;
      if (status === 'delivered') break;
    }

    expect(status).toBe('delivered');
    expect(body.delivered_via).toBe('email');
    expect(body.id).toBe(notifId);
    expect(body.delivery_attempts).toBeDefined();
    expect(Array.isArray(body.delivery_attempts)).toBe(true);
    expect((body.delivery_attempts as unknown[]).length).toBeGreaterThan(0);
    expect(body.request_id).toBeDefined();
    // tenant_id must be stripped from response (per route handler line 314)
    expect(body.tenant_id).toBeUndefined();
  });

  it('Test 4: list notifications — contains the sent notification', async () => {
    const res = await get('/v1/notifications', {
      authorization: `Bearer ${apiKey1}`,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.request_id).toBeDefined();

    const items = body.data as Array<Record<string, unknown>>;
    const found = items.find(n => n.id === notifId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('delivered');
  });

  it('Test 5: notification summary — counts reflect the sent notification', async () => {
    const res = await get('/v1/notifications/summary', {
      authorization: `Bearer ${apiKey1}`,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body.request_id).toBeDefined();
    expect(typeof body.total).toBe('number');
    expect(typeof body.delivered).toBe('number');
    expect((body.total as number)).toBeGreaterThanOrEqual(1);
    expect((body.delivered as number)).toBeGreaterThanOrEqual(1);
  });

  it('Test 6: engagement tracking pixel — returns 200 with image/gif', async () => {
    const res = await get(`/v1/engagement/track?nid=${notifId}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/gif');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('Test 7: engagement recorded — delivery attempt shows engaged=true', async () => {
    const res = await get(`/v1/notifications/${notifId}`, {
      authorization: `Bearer ${apiKey1}`,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const attempts = body.delivery_attempts as Array<Record<string, unknown>>;

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].engaged).toBe(true);
    expect(attempts[0].engagement_type).toBe('email_open');
    expect(attempts[0].engaged_at).toBeDefined();
  });

  it('Test 8: tenant isolation — second tenant cannot access first tenant notification', async () => {
    // Register second tenant
    const regRes = await post('/v1/tenants/register', {
      company_name: `Rival Corp ${Date.now()}`,
    });
    expect(regRes.status).toBe(201);
    const regBody = await regRes.json() as Record<string, unknown>;
    apiKey2 = regBody.api_key as string;
    expect(apiKey2).toBeDefined();

    // Try to access first tenant's notification with second tenant's key
    const res = await get(`/v1/notifications/${notifId}`, {
      authorization: `Bearer ${apiKey2}`,
    });

    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).code).toBe('FORBIDDEN');
  });
});
