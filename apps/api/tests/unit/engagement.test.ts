import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mockQuery, mockRelease, mockConnect } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  pool: {
    connect: mockConnect,
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { engagementRouter } from '../../src/routes/engagement.js';

const app = express();
app.use('/v1/engagement', engagementRouter);

describe('GET /v1/engagement/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  it('happy path: tracks engagement and returns pixel', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            tenant_id: 'tenant-1',
            recipient: 'test@example.com',
            channel_type: 'email',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // update delivery_attempts
      .mockResolvedValueOnce({ rows: [] }) // upsert recipient_channel_stats
      .mockResolvedValueOnce({ rows: [] }); // reset tenant context

    const res = await request(app)
      .get('/v1/engagement/track')
      .query({ nid: '123e4567-e89b-12d3-a456-426614174000' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');

    expect(mockConnect).toHaveBeenCalled();

    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT set_config('app.current_tenant_id', $1, false)",
      ['tenant-1'],
    );

    const upsertCall = mockQuery.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('INSERT INTO recipient_channel_stats'),
    );
    expect(upsertCall).toBeDefined();

    expect(mockRelease).toHaveBeenCalled();
  });
});