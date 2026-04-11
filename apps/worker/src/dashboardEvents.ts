import { Redis } from 'ioredis';
import type { DashboardEventName } from '@notifyengine/shared';
import { logger } from './logger.js';

const DASHBOARD_CHANNEL = 'dashboard:events';

interface DashboardEventMessage {
  tenantId: string;
  event: DashboardEventName;
  payload: Record<string, unknown>;
}

export interface DashboardEventPublisher {
  emit(tenantId: string, event: DashboardEventName, payload: Record<string, unknown>): void;
  close(): Promise<void>;
}

export function createDashboardEventPublisher(redisUrl: string): DashboardEventPublisher {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Dashboard event publisher Redis error');
  });

  return {
    emit(tenantId: string, event: DashboardEventName, payload: Record<string, unknown>): void {
      const message: DashboardEventMessage = { tenantId, event, payload };
      redis.publish(DASHBOARD_CHANNEL, JSON.stringify(message)).catch((err) => {
        logger.error({ err, event, tenantId }, 'Failed to publish dashboard event');
      });
    },

    async close(): Promise<void> {
      redis.disconnect();
    },
  };
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return email.substring(0, Math.min(2, at)) + '***' + email.substring(at);
}
