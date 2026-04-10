import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// ── Hoisted mocks ──
const { mockPoolConnect, mockPoolQuery } = vi.hoisted(() => ({
  mockPoolConnect: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  pool: { query: mockPoolQuery, connect: mockPoolConnect },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { tenantRouter } from '../../src/routes/tenants.js';

// ── Test app ──

const app = express();
app.use(express.json());
app.use('/v1/tenants', tenantRouter);

// ── Helpers ──

let server: ReturnType<typeof app.listen>;
let serverPort: number;

function post(path: string, body: unknown) {
  return fetch(`http://127.0.0.1:${serverPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

// ── Helpers to mock the transaction sequence ──

function setupSuccessClient() {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };

  const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  let callIndex = 0;
  const responses: Array<{ rows: unknown[] }> = [
    { rows: [] },                                    // 0: BEGIN
    { rows: [] },                                    // 1: SELECT slug duplicate check
    { rows: [{ id: tenantId, name: 'Acme Corp', slug: 'acme-corp', created_at: '2026-04-01T12:00:00.000Z' }] }, // 2: INSERT tenant RETURNING
    { rows: [] },                                    // 3: INSERT api_key
    { rows: [] },                                    // 4: set_config (RLS for channel inserts)
    { rows: [] },                                    // 5: INSERT channels
    { rows: [] },                                    // 6: set_config reset
    { rows: [] },                                    // 7: COMMIT
  ];

  mockClient.query.mockImplementation(() => {
    const result = responses[callIndex] ?? { rows: [] };
    callIndex++;
    return Promise.resolve(result);
  });

  return { mockClient, tenantId };
}

// ── Tests ──

describe('POST /v1/tenants/register', () => {
  it('returns 201 with tenant_id, api_key, slug, and response shape', async () => {
    const { mockClient, tenantId } = setupSuccessClient();
    mockPoolConnect.mockResolvedValueOnce(mockClient);

    const res = await post('/v1/tenants/register', {
      company_name: 'Acme Corp',
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    // Response shape per spec
    expect(body.tenant_id).toBe(tenantId);
    expect(body.company_name).toBe('Acme Corp');
    expect(body.slug).toBe('acme-corp');
    expect(body.api_key).toBeDefined();
    expect(body.api_key).toMatch(/^ne_test_/);  // NODE_ENV != production => ne_test_
    expect(body.message).toContain('Save this API key');
    expect(body.created_at).toBeDefined();
    expect(body.request_id).toBeDefined();

    // Verify transaction committed
    const lastQueryCall = mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1];
    expect(lastQueryCall[0]).toBe('COMMIT');

    // Verify client was released
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 409 DUPLICATE_TENANT when slug already exists', async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    let callIndex = 0;
    const responses: Array<{ rows: unknown[] }> = [
      { rows: [] },                                  // 0: BEGIN
      { rows: [{ id: 'existing-id' }] },             // 1: SELECT slug — found duplicate
      { rows: [] },                                  // 2: ROLLBACK
    ];

    mockClient.query.mockImplementation(() => {
      const result = responses[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(result);
    });

    mockPoolConnect.mockResolvedValueOnce(mockClient);

    const res = await post('/v1/tenants/register', {
      company_name: 'Acme Corp',
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_TENANT');
    expect(body.request_id).toBeDefined();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when company_name is missing', async () => {
    const res = await post('/v1/tenants/register', {});

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.request_id).toBeDefined();
  });

  it('returns 400 VALIDATION_ERROR when company_name is empty', async () => {
    const res = await post('/v1/tenants/register', {
      company_name: '',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates 3 default channels (email, websocket, webhook)', async () => {
    const { mockClient } = setupSuccessClient();
    mockPoolConnect.mockResolvedValueOnce(mockClient);

    await post('/v1/tenants/register', { company_name: 'NewCo' });

    // Find the INSERT INTO channels call
    const channelInsertCall = mockClient.query.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO channels'),
    );
    expect(channelInsertCall).toBeDefined();
    const sql = channelInsertCall![0] as string;
    expect(sql).toContain("'email'");
    expect(sql).toContain("'websocket'");
    expect(sql).toContain("'webhook'");
  });

  it('handles PG unique constraint violation (23505) as duplicate', async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    const pgError = new Error('unique_violation') as Error & { code: string };
    pgError.code = '23505';

    let callIndex = 0;
    const responses: Array<{ rows: unknown[] } | Error> = [
      { rows: [] },     // 0: BEGIN
      { rows: [] },     // 1: SELECT slug — no duplicate
      pgError,          // 2: INSERT tenant — unique constraint violation
      { rows: [] },     // 3: ROLLBACK (in catch block)
    ];

    mockClient.query.mockImplementation(() => {
      const result = responses[callIndex] ?? { rows: [] };
      callIndex++;
      if (result instanceof Error) return Promise.reject(result);
      return Promise.resolve(result);
    });

    mockPoolConnect.mockResolvedValueOnce(mockClient);

    const res = await post('/v1/tenants/register', {
      company_name: 'Race Condition Corp',
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('DUPLICATE_TENANT');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
