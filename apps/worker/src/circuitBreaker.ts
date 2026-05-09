import type pg from 'pg';
import { logger } from './logger.js';
import type { CircuitState } from './features.js';

const WINDOW_SECONDS = 60;
const FAILURE_RATE_THRESHOLD = 0.5;
const MIN_SAMPLE_SIZE = 10;
const BASE_COOLDOWN_SECONDS = 60;
const MAX_COOLDOWN_SECONDS = 300;

interface ChannelCircuitRow {
  id: string;
  tenant_id: string;
  type: string;
  circuit_state: CircuitState;
  failure_count: number;
  circuit_opened_at: Date | null;
}

export async function shouldAllowChannelProbe(
  client: pg.PoolClient,
  channelId: string,
): Promise<boolean> {
  const result = await client.query<ChannelCircuitRow>(
    `SELECT id, tenant_id, type, circuit_state, failure_count, circuit_opened_at
     FROM channels
     WHERE id = $1`,
    [channelId],
  );

  const channel = result.rows[0];

  if (!channel) {
    return false;
  }

  if (channel.circuit_state === 'closed') {
    return true;
  }

  if (channel.circuit_state === 'half_open') {
    return true;
  }

  if (!channel.circuit_opened_at) {
    return false;
  }

  const cooldownSeconds = Math.min(
    BASE_COOLDOWN_SECONDS * Math.max(channel.failure_count, 1),
    MAX_COOLDOWN_SECONDS,
  );

  const openedAt = new Date(channel.circuit_opened_at).getTime();
  const elapsedSeconds = (Date.now() - openedAt) / 1000;

  if (elapsedSeconds < cooldownSeconds) {
    return false;
  }

  await updateCircuitState(client, channel, 'half_open');

  return true;
}

export async function recordCircuitBreakerOutcome(
  client: pg.PoolClient,
  channelId: string,
  success: boolean,
): Promise<void> {
  const result = await client.query<ChannelCircuitRow>(
    `SELECT id, tenant_id, type, circuit_state, failure_count, circuit_opened_at
     FROM channels
     WHERE id = $1`,
    [channelId],
  );

  const channel = result.rows[0];

  if (!channel) {
    return;
  }

  if (success) {
    if (channel.circuit_state !== 'closed' || channel.failure_count !== 0) {
      await client.query(
        `UPDATE channels
         SET circuit_state = 'closed',
             failure_count = 0,
             last_failure_at = NULL,
             circuit_opened_at = NULL
         WHERE id = $1`,
        [channelId],
      );

      emitStateChange(channel, 'closed', 0);
    }

    return;
  }

  if (channel.circuit_state === 'half_open') {
    const nextFailureCount = Math.max(channel.failure_count + 1, 2);

    await client.query(
      `UPDATE channels
       SET circuit_state = 'open',
           failure_count = $2,
           last_failure_at = NOW(),
           circuit_opened_at = NOW()
       WHERE id = $1`,
      [channelId, nextFailureCount],
    );

    emitStateChange(channel, 'open', nextFailureCount);
    return;
  }

  await client.query(
    `UPDATE channels
     SET failure_count = failure_count + 1,
         last_failure_at = NOW()
     WHERE id = $1`,
    [channelId],
  );

  const stats = await client.query<{ total: string; failed: string }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM delivery_attempts
     WHERE channel_id = $1
       AND started_at >= NOW() - ($2 || ' seconds')::interval`,
    [channelId, WINDOW_SECONDS],
  );

  const total = Number(stats.rows[0]?.total ?? 0);
  const failed = Number(stats.rows[0]?.failed ?? 0);
  const failureRate = total > 0 ? failed / total : 0;

  if (total > MIN_SAMPLE_SIZE && failureRate > FAILURE_RATE_THRESHOLD) {
    const nextFailureCount = Math.max(channel.failure_count + 1, 1);

    await client.query(
      `UPDATE channels
       SET circuit_state = 'open',
           failure_count = $2,
           last_failure_at = NOW(),
           circuit_opened_at = NOW()
       WHERE id = $1`,
      [channelId, nextFailureCount],
    );

    emitStateChange(channel, 'open', nextFailureCount);
  }
}

async function updateCircuitState(
  client: pg.PoolClient,
  channel: ChannelCircuitRow,
  newState: CircuitState,
): Promise<void> {
  await client.query(
    `UPDATE channels
     SET circuit_state = $2
     WHERE id = $1`,
    [channel.id, newState],
  );

  emitStateChange(channel, newState, channel.failure_count);
}

function emitStateChange(
  channel: ChannelCircuitRow,
  newState: CircuitState,
  failureCount: number,
): void {
  logger.info(
    {
      channelId: channel.id,
      tenantId: channel.tenant_id,
      channelType: channel.type,
      previousState: channel.circuit_state,
      newState,
      failureCount,
    },
    'Circuit breaker state changed',
  );
}