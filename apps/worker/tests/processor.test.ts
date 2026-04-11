import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { NotificationJob } from '@notifyengine/shared';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import type { DashboardEventPublisher } from '../src/dashboardEvents.js';

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
  // 7: UPSERT recipient_channel_stats
  pushResult([]);
  // 8: UPDATE status=delivered
  pushResult([]);
  // 9: (finally) set_config reset
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

    // Verify delivery_attempt was inserted (call 6)
    const insertCall = client.query.mock.calls[6];
    expect(insertCall[0]).toContain('INSERT INTO delivery_attempts');
    const insertParams = insertCall[1];
    expect(insertParams[0]).toBe(TENANT_ID);          // tenant_id
    expect(insertParams[1]).toBe(NOTIF_ID);            // notification_id
    expect(insertParams[2]).toBe(CHANNEL_ID);          // channel_id
    expect(insertParams[3]).toBe('email');              // channel_type
    expect(insertParams[5]).toBe('success');            // status

    // Verify recipient_channel_stats UPSERT (call 7)
    const upsertCall = client.query.mock.calls[7];
    expect(upsertCall[0]).toContain('INSERT INTO recipient_channel_stats');
    expect(upsertCall[0]).toContain('ON CONFLICT');

    // Verify notification status updated to delivered (call 8)
    const deliveredCall = client.query.mock.calls[8];
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
    // 7: UPSERT recipient_channel_stats
    pushResult([]);
    // 8: UPDATE status=failed
    pushResult([]);
    // 9: set_config reset
    pushResult([]);

    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: false, error: 'SMTP timeout' });

    await expect(processNotification(makeJob())).rejects.toThrow('All channels exhausted');

    // Verify delivery attempt was recorded as failure
    const insertCall = client.query.mock.calls[6];
    expect(insertCall[0]).toContain('INSERT INTO delivery_attempts');
    expect(insertCall[1][5]).toBe('failure');           // status
    expect(insertCall[1][7]).toBe('SMTP timeout');      // error_message

    // Verify recipient_channel_stats UPSERT (call 7)
    expect(client.query.mock.calls[7][0]).toContain('INSERT INTO recipient_channel_stats');

    // Verify notification status set to failed (call 8)
    const failedCall = client.query.mock.calls[8];
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
    // 7: UPSERT recipient_channel_stats
    pushResult([]);
    // 8: UPDATE status=delivered
    pushResult([]);
    // 9: set_config reset
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
    // 7: UPSERT recipient_channel_stats
    pushResult([]);
    // 8: UPDATE status=delivered
    pushResult([]);
    // 9: set_config reset
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

// ── Dashboard event publish tests ──

function makeMockPublisher(): DashboardEventPublisher & { emit: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('processNotification — dashboard events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits delivery.completed and notification.status_changed=delivered on success', async () => {
    const client = setupHappyPathClient();
    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });
    const publisher = makeMockPublisher();

    await processNotification(makeJob(), publisher);

    const emitCalls = publisher.emit.mock.calls;

    // 1st emit: notification.status_changed queued→processing
    expect(emitCalls[0][0]).toBe(TENANT_ID);
    expect(emitCalls[0][1]).toBe(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED);
    expect(emitCalls[0][2]).toMatchObject({
      notificationId: NOTIF_ID,
      previousStatus: 'queued',
      newStatus: 'processing',
      channel: null,
    });
    expect(emitCalls[0][2].timestamp).toBeDefined();

    // 2nd emit: delivery.completed with success
    expect(emitCalls[1][1]).toBe(DASHBOARD_EVENTS.DELIVERY_COMPLETED);
    const deliveryPayload = emitCalls[1][2];
    expect(deliveryPayload).toMatchObject({
      notificationId: NOTIF_ID,
      recipient: 'us***@example.com',
      channel: 'email',
      status: 'success',
      statusCode: 200,
      attemptNumber: 1,
      priority: 'standard',
      routing: {
        mode: 'static',
        exploration: false,
        modelVersion: null,
      },
    });
    expect(typeof deliveryPayload.durationMs).toBe('number');
    expect(deliveryPayload.timestamp).toBeDefined();

    // 3rd emit: notification.status_changed processing→delivered
    expect(emitCalls[2][1]).toBe(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED);
    expect(emitCalls[2][2]).toMatchObject({
      notificationId: NOTIF_ID,
      previousStatus: 'processing',
      newStatus: 'delivered',
      channel: 'email',
    });

    expect(publisher.emit).toHaveBeenCalledTimes(3);
  });

  it('emits delivery.completed with failure and notification.status_changed=failed', async () => {
    const { client, pushResult } = makeMockClient();

    pushResult([]); // set_config
    pushResult([]); // UPDATE processing
    pushResult([{   // SELECT notification
      recipient: 'user@example.com',
      subject: 'Test',
      body: 'Hello',
      body_html: null,
    }]);
    pushResult([{   // SELECT channels
      id: CHANNEL_ID, type: 'email', label: 'Email',
      config: {}, circuit_state: 'closed', priority: 10,
    }]);
    pushResult([]); // SELECT stats
    pushResult([]); // UPDATE routing_decision
    pushResult([]); // INSERT delivery_attempt
    pushResult([]); // UPSERT recipient_channel_stats
    pushResult([]); // UPDATE status=failed
    pushResult([]); // set_config reset

    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: false, error: 'SMTP timeout' });
    const publisher = makeMockPublisher();

    await expect(processNotification(makeJob(), publisher)).rejects.toThrow('All channels exhausted');

    const emitCalls = publisher.emit.mock.calls;

    // 1st: queued→processing
    expect(emitCalls[0][1]).toBe(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED);
    expect(emitCalls[0][2].newStatus).toBe('processing');

    // 2nd: delivery.completed with failure
    expect(emitCalls[1][1]).toBe(DASHBOARD_EVENTS.DELIVERY_COMPLETED);
    expect(emitCalls[1][2]).toMatchObject({
      notificationId: NOTIF_ID,
      channel: 'email',
      status: 'failure',
      statusCode: null,
    });

    // 3rd: processing→failed
    expect(emitCalls[2][1]).toBe(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED);
    expect(emitCalls[2][2]).toMatchObject({
      notificationId: NOTIF_ID,
      previousStatus: 'processing',
      newStatus: 'failed',
      channel: null,
    });
  });

  it('publish failure does not throw or block the delivery pipeline', async () => {
    const client = setupHappyPathClient();
    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });

    const publisher = makeMockPublisher();
    publisher.emit.mockImplementation(() => {
      throw new Error('Redis connection lost');
    });

    // processNotification should complete normally despite publish errors
    await processNotification(makeJob(), publisher);

    // Verify delivery still completed in the database (call 8: after UPSERT at call 7)
    const deliveredCall = client.query.mock.calls[8];
    expect(deliveredCall[0]).toContain("status = 'delivered'");
    expect(client.release).toHaveBeenCalled();
  });

  it('payload matches socketio-dashboard-contract.md format exactly', async () => {
    const client = setupHappyPathClient();
    mockPoolConnect.mockResolvedValueOnce(client);
    mockDeliverEmail.mockResolvedValueOnce({ success: true, statusCode: 200 });
    const publisher = makeMockPublisher();

    await processNotification(makeJob(), publisher);

    // Validate delivery.completed payload has all required fields from contract
    const deliveryCall = publisher.emit.mock.calls.find(
      (c: unknown[]) => c[1] === DASHBOARD_EVENTS.DELIVERY_COMPLETED,
    );
    expect(deliveryCall).toBeDefined();

    const [emittedTenantId, emittedEvent, payload] = deliveryCall!;

    // Envelope fields
    expect(emittedTenantId).toBe(TENANT_ID);
    expect(emittedEvent).toBe('delivery.completed');

    // All DeliveryCompletedPayload fields per contract
    expect(payload).toHaveProperty('notificationId');
    expect(payload).toHaveProperty('recipient');
    expect(payload).toHaveProperty('channel');
    expect(payload).toHaveProperty('status');
    expect(payload).toHaveProperty('statusCode');
    expect(payload).toHaveProperty('durationMs');
    expect(payload).toHaveProperty('attemptNumber');
    expect(payload).toHaveProperty('routing');
    expect(payload).toHaveProperty('priority');
    expect(payload).toHaveProperty('timestamp');

    // Routing sub-object per contract
    expect(payload.routing).toHaveProperty('mode');
    expect(payload.routing).toHaveProperty('exploration');
    expect(payload.routing).toHaveProperty('modelVersion');

    // Security: recipient is masked, not raw
    expect(payload.recipient).not.toBe('user@example.com');
    expect(payload.recipient).toContain('***');

    // Validate notification.status_changed payload
    const statusCall = publisher.emit.mock.calls.find(
      (c: unknown[]) => c[1] === DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED && (c[2] as Record<string, unknown>).newStatus === 'delivered',
    );
    expect(statusCall).toBeDefined();
    const statusPayload = statusCall![2];
    expect(statusPayload).toHaveProperty('notificationId');
    expect(statusPayload).toHaveProperty('previousStatus');
    expect(statusPayload).toHaveProperty('newStatus');
    expect(statusPayload).toHaveProperty('channel');
    expect(statusPayload).toHaveProperty('timestamp');
  });
});
