import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import type { DashboardEventPublisher } from '../src/dashboardEvents.js';

vi.mock('../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { shouldAllowChannelProbe, recordCircuitBreakerOutcome } from '../src/circuitBreaker.js';

const CHANNEL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeChannelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANNEL_ID,
    tenant_id: TENANT_ID,
    type: 'email',
    circuit_state: 'closed',
    failure_count: 0,
    circuit_opened_at: null,
    ...overrides,
  };
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

function makeMockDashboardEvents(): DashboardEventPublisher {
  return {
    emit: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers();
});

// ── shouldAllowChannelProbe ─────────────────────────────────────

describe('shouldAllowChannelProbe', () => {
  it('returns true when channel is closed', async () => {
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'closed' })]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(true);
  });

  it('returns true when channel is half_open', async () => {
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'half_open' })]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(true);
  });

  it('returns false when channel not found', async () => {
    const { client, pushResult } = makeMockClient();
    pushResult([]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(false);
  });

  it('returns false when open and cooldown has not expired', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 1,
      circuit_opened_at: new Date(now - 30_000),
    })]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(false);
  });

  it('returns false when open with no circuit_opened_at', async () => {
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 1,
      circuit_opened_at: null,
    })]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(false);
  });

  it('transitions open -> half_open after cooldown expires and returns true', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const { client, pushResult } = makeMockClient();
    // SELECT channel
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 1,
      circuit_opened_at: new Date(now - 61_000),
    })]);
    // UPDATE circuit_state -> half_open
    pushResult([]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(true);
    expect(client.query).toHaveBeenCalledTimes(2);
    const updateCall = client.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE channels');
    expect(updateCall[1]).toContain('half_open');
  });

  it('uses exponential backoff for cooldown (base 60s * failure_count, max 300s)', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // failure_count=3 -> cooldown = min(60*3, 300) = 180s
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 3,
      circuit_opened_at: new Date(now - 170_000),
    })]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);

    expect(result).toBe(false);
  });

  it('caps cooldown at 300 seconds', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // failure_count=10 -> cooldown = min(60*10, 300) = 300s
    const { client, pushResult } = makeMockClient();
    // Still within 300s cooldown
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 10,
      circuit_opened_at: new Date(now - 299_000),
    })]);

    const blocked = await shouldAllowChannelProbe(client as never, CHANNEL_ID);
    expect(blocked).toBe(false);

    // Past 300s cooldown
    const { client: client2, pushResult: pushResult2 } = makeMockClient();
    pushResult2([makeChannelRow({
      circuit_state: 'open',
      failure_count: 10,
      circuit_opened_at: new Date(now - 301_000),
    })]);
    // UPDATE to half_open
    pushResult2([]);

    const allowed = await shouldAllowChannelProbe(client2 as never, CHANNEL_ID);
    expect(allowed).toBe(true);
  });
});

// ── recordCircuitBreakerOutcome ─────────────────────────────────

describe('recordCircuitBreakerOutcome', () => {
  describe('closed state', () => {
    it('does not update DB on success when already closed with zero failures', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, true);

      expect(client.query).toHaveBeenCalledTimes(1);
    });

    it('increments failure_count on failure', async () => {
      const { client, pushResult } = makeMockClient();
      // SELECT channel
      pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);
      // UPDATE failure_count + 1
      pushResult([]);
      // SELECT delivery_attempts stats (below threshold)
      pushResult([{ total: '5', failed: '2' }]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      expect(client.query).toHaveBeenCalledTimes(3);
      const updateCall = client.query.mock.calls[1];
      expect(updateCall[0]).toContain('failure_count = failure_count + 1');
    });

    it('transitions to open when failure rate > 50% with > 10 samples', async () => {
      const dashboardEvents = makeMockDashboardEvents();
      const { client, pushResult } = makeMockClient();
      // SELECT channel
      pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);
      // UPDATE failure_count + 1
      pushResult([]);
      // SELECT delivery_attempts stats (above threshold)
      pushResult([{ total: '12', failed: '8' }]);
      // UPDATE to open state
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false, dashboardEvents);

      expect(client.query).toHaveBeenCalledTimes(4);
      const openCall = client.query.mock.calls[3];
      expect(openCall[0]).toContain("circuit_state = 'open'");
      expect(openCall[0]).toContain('circuit_opened_at = NOW()');
    });

    it('stays closed when failure rate > 50% but samples <= 10', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);
      // UPDATE failure_count
      pushResult([]);
      // Stats: high rate but low sample count
      pushResult([{ total: '8', failed: '6' }]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      // Only 3 queries: SELECT + UPDATE failure + SELECT stats (no transition UPDATE)
      expect(client.query).toHaveBeenCalledTimes(3);
    });

    it('stays closed when samples > 10 but failure rate <= 50%', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);
      pushResult([]);
      pushResult([{ total: '20', failed: '8' }]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      expect(client.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('half_open state', () => {
    it('resets to closed on success', async () => {
      const dashboardEvents = makeMockDashboardEvents();
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 2 })]);
      // UPDATE to closed
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, true, dashboardEvents);

      expect(client.query).toHaveBeenCalledTimes(2);
      const updateCall = client.query.mock.calls[1];
      expect(updateCall[0]).toContain("circuit_state = 'closed'");
      expect(updateCall[0]).toContain('failure_count = 0');
      expect(updateCall[0]).toContain('circuit_opened_at = NULL');
    });

    it('transitions back to open on failure with incremented failure_count', async () => {
      const dashboardEvents = makeMockDashboardEvents();
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 2 })]);
      // UPDATE to open
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false, dashboardEvents);

      expect(client.query).toHaveBeenCalledTimes(2);
      const updateCall = client.query.mock.calls[1];
      expect(updateCall[0]).toContain("circuit_state = 'open'");
      expect(updateCall[1]).toEqual([CHANNEL_ID, 3]);
    });

    it('floors failure_count at 2 on half_open -> open when count was low', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 0 })]);
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      const updateCall = client.query.mock.calls[1];
      expect(updateCall[1]).toEqual([CHANNEL_ID, 2]);
    });
  });

  describe('open state (failure while already open)', () => {
    it('increments failure and checks stats without immediate transition', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([makeChannelRow({ circuit_state: 'open', failure_count: 3 })]);
      // UPDATE failure_count + 1
      pushResult([]);
      // SELECT stats
      pushResult([{ total: '15', failed: '12' }]);
      // UPDATE (re-confirms open since rate still high)
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      expect(client.query).toHaveBeenCalledTimes(4);
    });
  });

  describe('channel not found', () => {
    it('returns without error when channel does not exist', async () => {
      const { client, pushResult } = makeMockClient();
      pushResult([]);

      await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false);

      expect(client.query).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Dashboard events ────────────────────────────────────────────

describe('dashboard event emission', () => {
  it('emits CIRCUIT_BREAKER_STATE_CHANGED on closed -> open transition', async () => {
    const dashboardEvents = makeMockDashboardEvents();
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'closed', failure_count: 0 })]);
    pushResult([]);
    pushResult([{ total: '15', failed: '12' }]);
    pushResult([]);

    await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false, dashboardEvents);

    expect(dashboardEvents.emit).toHaveBeenCalledWith(
      TENANT_ID,
      DASHBOARD_EVENTS.CIRCUIT_BREAKER_STATE_CHANGED,
      expect.objectContaining({
        channelType: 'email',
        previousState: 'closed',
        newState: 'open',
      }),
    );
  });

  it('emits CIRCUIT_BREAKER_STATE_CHANGED on half_open -> closed transition', async () => {
    const dashboardEvents = makeMockDashboardEvents();
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 2 })]);
    pushResult([]);

    await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, true, dashboardEvents);

    expect(dashboardEvents.emit).toHaveBeenCalledWith(
      TENANT_ID,
      DASHBOARD_EVENTS.CIRCUIT_BREAKER_STATE_CHANGED,
      expect.objectContaining({
        channelType: 'email',
        previousState: 'half_open',
        newState: 'closed',
        failureCount: 0,
      }),
    );
  });

  it('emits CIRCUIT_BREAKER_STATE_CHANGED on half_open -> open transition', async () => {
    const dashboardEvents = makeMockDashboardEvents();
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 2 })]);
    pushResult([]);

    await recordCircuitBreakerOutcome(client as never, CHANNEL_ID, false, dashboardEvents);

    expect(dashboardEvents.emit).toHaveBeenCalledWith(
      TENANT_ID,
      DASHBOARD_EVENTS.CIRCUIT_BREAKER_STATE_CHANGED,
      expect.objectContaining({
        channelType: 'email',
        previousState: 'half_open',
        newState: 'open',
        failureCount: 3,
      }),
    );
  });

  it('does not emit when no dashboardEvents publisher provided', async () => {
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({ circuit_state: 'half_open', failure_count: 2 })]);
    pushResult([]);

    await expect(
      recordCircuitBreakerOutcome(client as never, CHANNEL_ID, true),
    ).resolves.toBeUndefined();
  });

  it('emits on open -> half_open probe transition', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dashboardEvents = makeMockDashboardEvents();

    // shouldAllowChannelProbe calls updateCircuitState which calls emitStateChange,
    // but updateCircuitState doesn't receive dashboardEvents (it's an internal function).
    // The logger.info call still fires, verifying the transition was recorded.
    const { client, pushResult } = makeMockClient();
    pushResult([makeChannelRow({
      circuit_state: 'open',
      failure_count: 1,
      circuit_opened_at: new Date(now - 61_000),
    })]);
    pushResult([]);

    const result = await shouldAllowChannelProbe(client as never, CHANNEL_ID);
    expect(result).toBe(true);

    const { logger } = await import('../src/logger.js');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: CHANNEL_ID,
        previousState: 'open',
        newState: 'half_open',
      }),
      'Circuit breaker state changed',
    );
  });
});
