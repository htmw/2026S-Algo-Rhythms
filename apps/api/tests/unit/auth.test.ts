import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks (must be declared before vi.mock factories) ──
const { mockQuery, mockConnect } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  pool: { query: mockQuery, connect: mockConnect },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { authMiddleware } from '../../src/middleware/auth.js';

// ── Helpers ──

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    on: vi.fn(),
  } as unknown as Response & { _status: number; _body: unknown };
  return res;
}

const next: NextFunction = vi.fn();

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── Tests ──

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 MISSING_API_KEY when Authorization header is absent', async () => {
    const req = makeReq({});
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('MISSING_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 MISSING_API_KEY when Authorization header has no Bearer prefix', async () => {
    const req = makeReq({ authorization: 'Basic abc123' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('MISSING_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 MISSING_API_KEY when Bearer token is empty', async () => {
    const req = makeReq({ authorization: 'Bearer ' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('MISSING_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 INVALID_API_KEY when key is not found in database', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ authorization: 'Bearer ne_test_fakekey123' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('INVALID_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 INTERNAL_ERROR when database query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const req = makeReq({ authorization: 'Bearer ne_test_somekey' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(500);
    expect((res._body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets tenant context on valid API key', async () => {
    const rawKey = 'ne_test_validkey1234567890abcdef';
    const keyHash = hashKey(rawKey);
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const apiKeyId = '22222222-2222-2222-2222-222222222222';

    // pool.query for key lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: apiKeyId,
        tenant_id: tenantId,
        key_hash: keyHash,
        scopes: ['notifications:write', 'notifications:read'],
      }],
    });

    // pool.connect for RLS client
    const mockClient = {
      query: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
    };
    mockConnect.mockResolvedValueOnce(mockClient);

    // pool.query for last_used_at update (fire-and-forget)
    mockQuery.mockResolvedValueOnce({});

    const req = makeReq({ authorization: `Bearer ${rawKey}` });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenantId).toBe(tenantId);
    expect(req.apiKeyId).toBe(apiKeyId);
    expect(req.scopes).toEqual(['notifications:write', 'notifications:read']);
    expect(req.dbClient).toBe(mockClient);

    // Verify RLS context was set on the dedicated client
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.current_tenant_id', $1, false)",
      [tenantId],
    );
  });

  it('response includes request_id on all error responses', async () => {
    const req = makeReq({});
    const res = makeRes();

    await authMiddleware(req, res, next);

    const body = res._body as { request_id: string };
    expect(body.request_id).toBeDefined();
    expect(typeof body.request_id).toBe('string');
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  it('returns 401 INVALID_API_KEY when key is expired', async () => {
    // The SQL query filters: expires_at IS NULL OR expires_at > NOW()
    // An expired key returns no rows from the query, triggering INVALID_API_KEY.
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ authorization: 'Bearer ne_test_expiredkey123' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('INVALID_API_KEY');
    expect(next).not.toHaveBeenCalled();

    // Verify the query was called with the SHA-256 hash of the key
    const hash = hashKey('ne_test_expiredkey123');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('expires_at'),
      [hash],
    );
  });

  it('returns 401 INVALID_API_KEY when key is revoked', async () => {
    // The SQL query filters: revoked_at IS NULL
    // A revoked key returns no rows from the query, triggering INVALID_API_KEY.
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = makeReq({ authorization: 'Bearer ne_test_revokedkey456' });
    const res = makeRes();

    await authMiddleware(req, res, next);

    expect(res._status).toBe(401);
    expect((res._body as { error: { code: string } }).error.code).toBe('INVALID_API_KEY');
    expect(next).not.toHaveBeenCalled();

    // Verify the query includes revoked_at filter
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL'),
      expect.any(Array),
    );
  });
});
