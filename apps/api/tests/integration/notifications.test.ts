import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// ── Mock pg pool ──
const mockPoolQuery = vi.fn();
vi.mock('../../src/db.js', () => ({
  pool: { query: mockPoolQuery, connect: vi.fn() },
}));

// ── Mock logger ──
vi.mock('../../src/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Mock BullMQ queue ──
const mockQueueAdd = vi.fn().mockResolvedValue({});
vi.mock('../../src/queue.js', () => ({
  getNotificationQueue: () => ({ add: mockQueueAdd }),
}));

// ── Mock content classification ──
const { mockClassifyContent } = vi.hoisted(() => ({
  mockClassifyContent: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/services/contentClassification.js', () => ({
  classifyContent: mockClassifyContent,
}));

import { notificationRouter } from '../../src/routes/notifications.js';

// ── Test app with fake auth middleware ──

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockDbClient = {
  query: vi.fn(),
  release: vi.fn(),
};

function fakeAuth(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  req.tenantId = TENANT_ID;
  req.apiKeyId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  req.scopes = ['notifications:write', 'notifications:read'];
  req.dbClient = mockDbClient as never;
  next();
}

const app = express();
app.use(express.json());
app.use('/v1/notifications', fakeAuth, notificationRouter);

// ── Helpers ──

function post(path: string, body: unknown) {
  return fetch(`http://127.0.0.1:${serverPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return fetch(`http://127.0.0.1:${serverPort}${path}`);
}

let server: ReturnType<typeof app.listen>;
let serverPort: number;

beforeEach(async () => {
  vi.clearAllMocks();

  if (!server) {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  }
});

afterAll(() => {
  server?.close();
});

// ── Tests ──

describe('POST /v1/notifications', () => {
  it('returns 202 with notification ID on valid request', async () => {
    const notifId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    // INSERT RETURNING id, created_at
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    // UPDATE status to queued
    mockDbClient.query.mockResolvedValueOnce({});

    const res = await post('/v1/notifications', {
      recipient: 'user@example.com',
      body: 'Test notification',
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.id).toBe(notifId);
    expect(body.status).toBe('queued');
    expect(body.priority).toBe('standard');
    expect(body.routing_mode).toBe('adaptive');
    expect(body.status_url).toBe(`/v1/notifications/${notifId}`);
    expect(body.request_id).toBeDefined();
    expect(body.created_at).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR when body is missing', async () => {
    const res = await post('/v1/notifications', {
      recipient: 'user@example.com',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.request_id).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR when recipient is missing', async () => {
    const res = await post('/v1/notifications', {
      body: 'Hello',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enqueues job to BullMQ on success', async () => {
    const notifId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    mockDbClient.query.mockResolvedValueOnce({});

    await post('/v1/notifications', {
      recipient: 'user@example.com',
      body: 'Test',
      priority: 'high',
    });

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = mockQueueAdd.mock.calls[0];
    expect(jobName).toBe('deliver');
    expect(jobData.notificationId).toBe(notifId);
    expect(jobData.tenantId).toBe(TENANT_ID);
    expect(jobData.priority).toBe('high');
    expect(jobData.routingMode).toBe('adaptive');
  });

  it('returns 503 when queue is unavailable', async () => {
    const notifId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    mockQueueAdd.mockRejectedValueOnce(new Error('Redis down'));

    const res = await post('/v1/notifications', {
      recipient: 'user@example.com',
      body: 'Test',
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('GET /v1/notifications/:id', () => {
  it('returns notification with delivery_attempts for valid UUID', async () => {
    const notifId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    // Notification query
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        id: notifId,
        tenant_id: TENANT_ID,
        status: 'delivered',
        recipient: 'user@example.com',
        subject: 'Test',
        priority: 'standard',
        routing_mode: 'adaptive',
        delivered_via: 'email',
        delivered_at: '2026-04-01T12:01:00.000Z',
        failed_at: null,
        routing_decision: { selected: 'email', exploration: false },
        metadata: {},
        created_at: '2026-04-01T12:00:00.000Z',
        updated_at: '2026-04-01T12:01:00.000Z',
      }],
    });
    // Delivery attempts query
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        channel_type: 'email',
        attempt_number: 1,
        status: 'success',
        status_code: 200,
        error_message: null,
        engaged: null,
        engagement_type: null,
        engaged_at: null,
        started_at: '2026-04-01T12:00:30.000Z',
        completed_at: '2026-04-01T12:01:00.000Z',
        duration_ms: 30000,
      }],
    });

    const res = await get(`/v1/notifications/${notifId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(notifId);
    expect(body.status).toBe('delivered');
    expect(body.delivery_attempts).toHaveLength(1);
    expect(body.delivery_attempts[0].channel_type).toBe('email');
    expect(body.request_id).toBeDefined();
    // tenant_id should be stripped from response
    expect(body.tenant_id).toBeUndefined();
  });

  it('returns 400 INVALID_ID for non-UUID id', async () => {
    const res = await get('/v1/notifications/not-a-uuid');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 NOT_FOUND when notification does not exist', async () => {
    mockDbClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await get('/v1/notifications/cccccccc-cccc-cccc-cccc-cccccccccccc');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 FORBIDDEN when notification belongs to another tenant', async () => {
    const otherTenant = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        tenant_id: otherTenant,
        status: 'delivered',
      }],
    });

    const res = await get('/v1/notifications/cccccccc-cccc-cccc-cccc-cccccccccccc');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /v1/notifications', () => {
  it('returns paginated list with correct shape', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: crypto.randomUUID(),
      recipient: `user${i}@example.com`,
      channel_preference: null,
      force_channel: null,
      routing_mode: 'adaptive',
      subject: `Test ${i}`,
      priority: 'standard',
      status: 'delivered',
      delivered_via: 'email',
      delivered_at: `2026-04-0${i + 1}T12:00:00.000Z`,
      failed_at: null,
      metadata: {},
      routing_decision: null,
      created_at: `2026-04-0${i + 1}T12:00:00.000Z`,
      updated_at: `2026-04-0${i + 1}T12:00:00.000Z`,
    }));

    mockDbClient.query.mockResolvedValueOnce({ rows });

    const res = await get('/v1/notifications');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.hasNextPage).toBe(false);
    expect(body.pagination.limit).toBe(20);
    expect(body.request_id).toBeDefined();
  });

  it('returns hasNextPage=true when more results exist', async () => {
    // Return limit + 1 rows to signal next page (default limit is 20)
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: crypto.randomUUID(),
      recipient: `user${i}@example.com`,
      channel_preference: null,
      force_channel: null,
      routing_mode: 'adaptive',
      subject: null,
      priority: 'standard',
      status: 'queued',
      delivered_via: null,
      delivered_at: null,
      failed_at: null,
      metadata: {},
      routing_decision: null,
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
      updated_at: new Date(Date.now() - i * 60_000).toISOString(),
    }));

    mockDbClient.query.mockResolvedValueOnce({ rows });

    const res = await get('/v1/notifications');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(20);
    expect(body.pagination.hasNextPage).toBe(true);
    expect(body.pagination.nextCursor).toBeDefined();
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await get('/v1/notifications?status=invalid');

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/notifications/summary', () => {
  it('returns correct shape with aggregated counts', async () => {
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        total: 150,
        delivered: 120,
        failed: 10,
        queued: 15,
        processing: 5,
      }],
    });

    const res = await get('/v1/notifications/summary');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(150);
    expect(body.delivered).toBe(120);
    expect(body.failed).toBe(10);
    expect(body.queued).toBe(15);
    expect(body.processing).toBe(5);
    expect(body.request_id).toBeDefined();
  });

  it('returns zeros when no notifications exist', async () => {
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ total: 0, delivered: 0, failed: 0, queued: 0, processing: 0 }],
    });

    const res = await get('/v1/notifications/summary');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});

describe('POST /v1/notifications (content classification)', () => {
  const VALID_CLASSIFICATION = {
    urgency_score: 0.8,
    category: 'security',
    category_encoded: 0,
    time_sensitivity_score: 0.9,
    sentiment_score: 0.3,
    optimal_channel_hint: 'sms_webhook',
    reasoning: 'Security alert requires immediate attention',
  };

  it('stores content_classification when classifyContent succeeds', async () => {
    const notifId = '11111111-1111-1111-1111-111111111111';
    mockClassifyContent.mockResolvedValueOnce(VALID_CLASSIFICATION);

    // INSERT RETURNING
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    // UPDATE status
    mockDbClient.query.mockResolvedValueOnce({});

    const postRes = await post('/v1/notifications', {
      recipient: 'user@example.com',
      subject: 'Security Alert',
      body: 'Your account was accessed from a new device',
    });
    expect(postRes.status).toBe(202);

    // Verify INSERT was called with classification as $12
    const insertCall = mockDbClient.query.mock.calls[0];
    expect(insertCall[0]).toContain('content_classification');
    expect(insertCall[1][11]).toBe(JSON.stringify(VALID_CLASSIFICATION));

    // GET the notification to confirm it's returned
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        id: notifId,
        tenant_id: TENANT_ID,
        status: 'queued',
        recipient: 'user@example.com',
        subject: 'Security Alert',
        priority: 'standard',
        routing_mode: 'adaptive',
        delivered_via: null,
        delivered_at: null,
        failed_at: null,
        routing_decision: null,
        content_classification: VALID_CLASSIFICATION,
        metadata: {},
        created_at: '2026-04-01T12:00:00.000Z',
        updated_at: '2026-04-01T12:00:00.000Z',
      }],
    });
    mockDbClient.query.mockResolvedValueOnce({ rows: [] });

    const getRes = await get(`/v1/notifications/${notifId}`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.content_classification).toEqual(VALID_CLASSIFICATION);
  });

  it('stores null content_classification when classifyContent returns null', async () => {
    const notifId = '22222222-2222-2222-2222-222222222222';
    mockClassifyContent.mockResolvedValueOnce(null);

    // INSERT RETURNING
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    // UPDATE status
    mockDbClient.query.mockResolvedValueOnce({});

    const postRes = await post('/v1/notifications', {
      recipient: 'user@example.com',
      body: 'Hello world',
    });
    expect(postRes.status).toBe(202);

    // Verify INSERT was called with null for classification
    const insertCall = mockDbClient.query.mock.calls[0];
    expect(insertCall[1][11]).toBeNull();

    // Verify notification was still enqueued
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);

    // GET to confirm null
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        id: notifId,
        tenant_id: TENANT_ID,
        status: 'queued',
        recipient: 'user@example.com',
        subject: null,
        priority: 'standard',
        routing_mode: 'adaptive',
        delivered_via: null,
        delivered_at: null,
        failed_at: null,
        routing_decision: null,
        content_classification: null,
        metadata: {},
        created_at: '2026-04-01T12:00:00.000Z',
        updated_at: '2026-04-01T12:00:00.000Z',
      }],
    });
    mockDbClient.query.mockResolvedValueOnce({ rows: [] });

    const getRes = await get(`/v1/notifications/${notifId}`);
    const body = await getRes.json();
    expect(body.content_classification).toBeNull();
  });

  it('still returns 202 promptly even when classifyContent adds latency', async () => {
    const notifId = '33333333-3333-3333-3333-333333333333';
    mockClassifyContent.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(VALID_CLASSIFICATION), 50)),
    );

    // INSERT RETURNING
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{ id: notifId, created_at: '2026-04-01T12:00:00.000Z' }],
    });
    // UPDATE status
    mockDbClient.query.mockResolvedValueOnce({});

    const start = Date.now();
    const res = await post('/v1/notifications', {
      recipient: 'user@example.com',
      subject: 'Newsletter',
      body: 'Weekly update',
    });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(202);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('POST /v1/notifications (idempotency)', () => {
  it('duplicate request with same Idempotency-Key returns existing notification', async () => {
    const notifId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    // Idempotency lookup returns existing notification
    mockDbClient.query.mockResolvedValueOnce({
      rows: [{
        id: notifId,
        status: 'queued',
        priority: 'standard',
        routing_mode: 'adaptive',
        created_at: '2026-04-01T12:00:00.000Z',
      }],
    });

    const res = await fetch(`http://127.0.0.1:${serverPort}/v1/notifications`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem-key-123',
      },
      body: JSON.stringify({
        recipient: 'user@example.com',
        body: 'Duplicate request',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(notifId);
    expect(body.status).toBe('queued');
    expect(body.status_url).toBe(`/v1/notifications/${notifId}`);
    expect(body.request_id).toBeDefined();

    // Should NOT have enqueued a new job
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
