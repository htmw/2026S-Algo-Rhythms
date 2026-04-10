import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { NotificationJob } from '@notifyengine/shared';

// ── Hoisted mocks ──
const { mockPoolConnect, mockDeliverEmail, mockPredictChannel } = vi.hoisted(() => ({
  mockPoolConnect: vi.fn(),
  mockDeliverEmail: vi.fn(),
  mockPredictChannel: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  pool: { connect: mockPoolConnect },
}));

vi.mock('../src/logger.js', () => {
  const child = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  child.child = vi.fn().mockReturnValue(child);
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnValue(child),
    },
  };
});

vi.mock('../src/channels/email.js', () => ({
  deliverEmail: mockDeliverEmail,
}));

vi.mock('../src/mlClient.js', () => ({
  predictChannel: mockPredictChannel,
}));

import { processNotification } from '../src/processor.js';

// ── Constants ──

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOTIF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CHANNEL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ── Helpers ──

function makeJob(overrides: Partial<NotificationJob> = {}): Job<NotificationJob> {
  return {
    id: 'job-1',
    data: {
      notificationId: NOTIF_ID,
      tenantId: TENANT_ID,
      recipient: 'user@example.com',
      priority: 'standard',
      routingMode: 'static',
      ...overrides,
    },
    attemptsMade: 0,
  } as unknown as Job<NotificationJob>;
}

function makeMockClient() {
  const queryResults: Array<{ rows: unknown[] }> = [];
  let callIndex = 0;

  const client = {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(result);
    }),
    release: vi.fn(),
  };

  function pushResult(rows: unknown[]) {
    queryResults.push({ rows });
  }

  return { client, pushResult };
}

/**
 * Sets up mock client with standard query sequence for a static-routing happy path:
 *  0: set_config (RLS)
 *  1: UPDATE status=processing
 *  2: SELECT notification content
 *  3: SELECT channels
 *  4: SELECT recipient_channel_stats
 *  5: UPDATE routing_decision
 *  ...delivery attempt + final update inserted by test
 */
function setupHappyPathClient() {
  const { client, pushResult } = makeMockClient();

  // 0: set_config
  pushResult([]);
  // 1: UPDATE status=processing
  pushResult([]);
  // 2: SELECT notification content
  pushResult([{
    recipient: 'user@example.com',
    subject: 'Test',
    body: 'Hello world',
    body_html: null,
  }]);
  // 3: SELECT channels (email only)
  pushResult([{
    id: CHANNEL_ID,
    type: 'email',
    label: 'Email',
    config: {},
    circuit_state: 'closed',
    priority: 10,
  }]);
  // 4: SELECT recipient_channel_stats (empty — new recipient)
  pushResult([]);
  // 5: UPDATE routing_decision
  pushResult([]);
  // 6: INSERT delivery_attempt
  pushResult([]);
  // 7: UPDATE status=delivered
  pushResult([]);
  // 8: (finally) set_config reset
  pushResult([]);

  return client;
}

// ── Tests ──

describe('processNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: delivers email, records attempt, updates status to delivered', async () => {
    const client = setupHappyPathClient();
    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });

    await processNotification(makeJob());

    // Verify set_config was called with tenant ID
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      "SELECT set_config('app.current_tenant_id', $1, false)",
      [TENANT_ID],
    );

    // Verify status set to processing
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = 'processing'"),
      [NOTIF_ID],
    );

    // Verify deliverEmail was called with notification content
    expect(mockDeliverEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Test',
      'Hello world',
      null,
    );

    // Verify delivery_attempt was inserted (call 7)
    const insertCall = client.query.mock.calls[6];
    expect(insertCall[0]).toContain('INSERT INTO delivery_attempts');
    const insertParams = insertCall[1];
    expect(insertParams[0]).toBe(TENANT_ID);          // tenant_id
    expect(insertParams[1]).toBe(NOTIF_ID);            // notification_id
    expect(insertParams[2]).toBe(CHANNEL_ID);          // channel_id
    expect(insertParams[3]).toBe('email');              // channel_type
    expect(insertParams[5]).toBe('success');            // status

    // Verify notification status updated to delivered (call 8)
    const deliveredCall = client.query.mock.calls[7];
    expect(deliveredCall[0]).toContain("status = 'delivered'");
    expect(deliveredCall[1][1]).toBe('email');          // delivered_via

    // Verify client released
    expect(client.release).toHaveBeenCalled();
  });

  it('failure path: email fails, throws error to trigger BullMQ retry', async () => {
    const { client, pushResult } = makeMockClient();

    // 0: set_config
    pushResult([]);
    // 1: UPDATE status=processing
    pushResult([]);
    // 2: SELECT notification content
    pushResult([{
      recipient: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      body_html: null,
    }]);
    // 3: SELECT channels (email only)
    pushResult([{
      id: CHANNEL_ID,
      type: 'email',
      label: 'Email',
      config: {},
      circuit_state: 'closed',
      priority: 10,
    }]);
    // 4: SELECT recipient_channel_stats
    pushResult([]);
    // 5: UPDATE routing_decision
    pushResult([]);
    // 6: INSERT delivery_attempt (failure)
    pushResult([]);
    // 7: UPDATE status=failed
    pushResult([]);
    // 8: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: false, error: 'SMTP timeout' });

    await expect(processNotification(makeJob())).rejects.toThrow('All channels exhausted');

    // Verify delivery attempt was recorded as failure
    const insertCall = client.query.mock.calls[6];
    expect(insertCall[0]).toContain('INSERT INTO delivery_attempts');
    expect(insertCall[1][5]).toBe('failure');           // status
    expect(insertCall[1][7]).toBe('SMTP timeout');      // error_message

    // Verify notification status set to failed
    const failedCall = client.query.mock.calls[7];
    expect(failedCall[0]).toContain("status = 'failed'");

    expect(client.release).toHaveBeenCalled();
  });

  it('all channels exhausted: non-email channels skipped, status set to failed', async () => {
    const { client, pushResult } = makeMockClient();

    // 0: set_config
    pushResult([]);
    // 1: UPDATE status=processing
    pushResult([]);
    // 2: SELECT notification content
    pushResult([{
      recipient: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      body_html: null,
    }]);
    // 3: SELECT channels (only websocket — not implemented)
    pushResult([{
      id: CHANNEL_ID,
      type: 'websocket',
      label: 'In-App WebSocket',
      config: {},
      circuit_state: 'closed',
      priority: 5,
    }]);
    // 4: SELECT recipient_channel_stats
    pushResult([]);
    // 5: UPDATE routing_decision
    pushResult([]);
    // 6: UPDATE status=failed (no delivery attempts because channel was skipped)
    pushResult([]);
    // 7: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);

    await expect(processNotification(makeJob())).rejects.toThrow('All channels exhausted');

    // deliverEmail should NOT have been called (websocket is not implemented)
    expect(mockDeliverEmail).not.toHaveBeenCalled();

    // Notification should be marked failed
    const failedCall = client.query.mock.calls[6];
    expect(failedCall[0]).toContain("status = 'failed'");

    expect(client.release).toHaveBeenCalled();
  });

  it('no available channels: throws error and marks notification failed', async () => {
    const { client, pushResult } = makeMockClient();

    // 0: set_config
    pushResult([]);
    // 1: UPDATE status=processing
    pushResult([]);
    // 2: SELECT notification content
    pushResult([{
      recipient: 'user@example.com',
      subject: null,
      body: 'Hello',
      body_html: null,
    }]);
    // 3: SELECT channels (empty — all disabled or circuit open)
    pushResult([]);
    // 4: UPDATE status=failed
    pushResult([]);
    // 5: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);

    await expect(processNotification(makeJob())).rejects.toThrow('No available channels');

    // Verify failed status (call 4: after set_config, UPDATE processing, SELECT notification, SELECT channels)
    const failedCall = client.query.mock.calls[4];
    expect(failedCall[0]).toContain("status = 'failed'");
  });

  it('adaptive routing: calls ML service and uses predicted channel', async () => {
    const { client, pushResult } = makeMockClient();

    // 0: set_config
    pushResult([]);
    // 1: UPDATE status=processing
    pushResult([]);
    // 2: SELECT notification content
    pushResult([{
      recipient: 'user@example.com',
      subject: 'Test',
      body: 'Hello world',
      body_html: null,
    }]);
    // 3: SELECT channels (email and websocket)
    pushResult([
      { id: CHANNEL_ID, type: 'email', label: 'Email', config: {}, circuit_state: 'closed', priority: 10 },
      { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', type: 'websocket', label: 'WS', config: {}, circuit_state: 'closed', priority: 5 },
    ]);
    // 4: SELECT recipient_channel_stats
    pushResult([]);
    // 5: UPDATE routing_decision
    pushResult([]);
    // 6: INSERT delivery_attempt
    pushResult([]);
    // 7: UPDATE status=delivered
    pushResult([]);
    // 8: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);
    mockPredictChannel.mockResolvedValueOnce({
      selected: 'email',
      predictions: { email: 0.82, websocket: 0.45 },
      exploration: false,
      reason: 'XGBoost predicted highest engagement for email',
      model_version: 'v12',
    });
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });

    await processNotification(makeJob({ routingMode: 'adaptive' }));

    expect(mockPredictChannel).toHaveBeenCalledTimes(1);
    const mlArgs = mockPredictChannel.mock.calls[0][0];
    expect(mlArgs.recipient).toBe('user@example.com');
    expect(mlArgs.available_channels).toContain('email');
    expect(mlArgs.exploration_rate).toBe(0.1);

    // Verify routing_decision persisted with adaptive mode
    const rdCall = client.query.mock.calls[5];
    expect(rdCall[0]).toContain('routing_decision');
    const rdJson = JSON.parse(rdCall[1][1]);
    expect(rdJson.mode).toBe('adaptive');
    expect(rdJson.selected).toBe('email');
    expect(rdJson.model_version).toBe('v12');
  });

  it('adaptive routing: falls back to static when ML service returns null', async () => {
    const { client, pushResult } = makeMockClient();

    // 0: set_config
    pushResult([]);
    // 1: UPDATE status=processing
    pushResult([]);
    // 2: SELECT notification content
    pushResult([{
      recipient: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      body_html: null,
    }]);
    // 3: SELECT channels
    pushResult([
      { id: CHANNEL_ID, type: 'email', label: 'Email', config: {}, circuit_state: 'closed', priority: 10 },
    ]);
    // 4: SELECT recipient_channel_stats
    pushResult([]);
    // 5: UPDATE routing_decision
    pushResult([]);
    // 6: INSERT delivery_attempt
    pushResult([]);
    // 7: UPDATE status=delivered
    pushResult([]);
    // 8: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);
    mockPredictChannel.mockResolvedValueOnce(null);
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });

    await processNotification(makeJob({ routingMode: 'adaptive' }));

    // Verify routing_decision is an adaptive fallback
    const rdCall = client.query.mock.calls[5];
    const rdJson = JSON.parse(rdCall[1][1]);
    expect(rdJson.mode).toBe('adaptive');
    expect(rdJson.model_version).toBeNull();
    expect(rdJson.reason).toContain('fell back to static');
  });
});
