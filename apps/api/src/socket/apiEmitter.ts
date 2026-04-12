import { Redis } from 'ioredis';
import type { DashboardEventName } from '@notifyengine/shared';
import { logger } from '../logger.js';

/**
 * Publishes dashboard events from API routes to the Redis
 * dashboard:events channel using the same envelope format as
 * the worker's DashboardEventPublisher. The dashboardBridge
 * subscriber picks these up and routes to the correct tenant
 * Socket.IO room — no direct Socket.IO dependency here.
 */

const DASHBOARD_CHANNEL = 'dashboard:events';

let publisher: Redis | null = null;

export function initApiEmitter(redisUrl: string): void {
  publisher = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  publisher.on('error', (err) => {
    logger.error({ err }, 'API dashboard event publisher Redis error');
  });
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return email.substring(0, Math.min(2, at)) + '***' + email.substring(at);
}

export function emitDashboardEvent(
  tenantId: string,
  event: DashboardEventName,
  payload: Record<string, unknown>,
): void {
  if (!publisher) {
    logger.warn({ event, tenantId }, 'API dashboard publisher not initialised, dropping event');
    return;
  }

  const message = JSON.stringify({ tenantId, event, payload });
  publisher.publish(DASHBOARD_CHANNEL, message).catch((err) => {
    logger.error({ err, event, tenantId }, 'Failed to publish API dashboard event');
  });
}
