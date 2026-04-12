import type { Namespace } from 'socket.io';
import type { DashboardEventName } from '@notifyengine/shared';
import { logger } from '../logger.js';

/**
 * Singleton emitter that lets API routes publish dashboard events
 * directly to the Socket.IO /dashboard namespace (same process).
 *
 * Initialised once from index.ts after registerDashboardNamespace().
 * Events follow the same envelope shape as the worker's Redis pub/sub
 * messages but skip the Redis hop since we're already in the API process.
 */
let dashboardNsp: Namespace | null = null;

export function initApiEmitter(nsp: Namespace): void {
  dashboardNsp = nsp;
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
  if (!dashboardNsp) {
    logger.warn({ event, tenantId }, 'Dashboard namespace not initialised, dropping event');
    return;
  }

  const room = `tenant:${tenantId}`;
  dashboardNsp.to(room).emit(event, payload);

  logger.debug({ tenantId, event, room }, 'API dashboard event emitted');
}
