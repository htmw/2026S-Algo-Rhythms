import { Redis } from 'ioredis';
import type { Namespace } from 'socket.io';
import { DASHBOARD_EVENTS, type DashboardEventName } from '@notifyengine/shared';
import { logger } from '../logger.js';

export const DASHBOARD_EVENTS_CHANNEL = 'dashboard:events';

interface DashboardEventMessage {
  tenantId: string;
  event: DashboardEventName;
  payload: unknown;
}

const VALID_EVENT_NAMES = new Set<string>(Object.values(DASHBOARD_EVENTS));

function parseMessage(raw: string): DashboardEventMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const tenantId = obj.tenantId;
  const event = obj.event;
  const payload = obj.payload;

  if (typeof tenantId !== 'string' || tenantId.length === 0) return null;
  if (typeof event !== 'string' || !VALID_EVENT_NAMES.has(event)) return null;
  if (payload === undefined) return null;

  return { tenantId, event: event as DashboardEventName, payload };
}

export interface DashboardBridge {
  stop: () => Promise<void>;
}

export async function startDashboardBridge(
  dashboardNsp: Namespace,
  subscriber: Redis,
): Promise<DashboardBridge> {
  subscriber.on('error', (err) => {
    logger.error({ err }, 'Dashboard bridge Redis subscriber error');
  });

  subscriber.on('message', (channel, raw) => {
    if (channel !== DASHBOARD_EVENTS_CHANNEL) return;

    const message = parseMessage(raw);
    if (!message) {
      logger.error({ channel, rawPreview: raw.slice(0, 200) }, 'Failed to parse dashboard event');
      return;
    }

    const room = `tenant:${message.tenantId}`;
    dashboardNsp.to(room).emit(message.event, message.payload);

    logger.debug(
      { tenantId: message.tenantId, event: message.event, room },
      'Dashboard event broadcast',
    );
  });

  await subscriber.subscribe(DASHBOARD_EVENTS_CHANNEL);
  logger.info({ channel: DASHBOARD_EVENTS_CHANNEL }, 'Dashboard bridge subscribed');

  return {
    stop: async () => {
      try {
        await subscriber.unsubscribe(DASHBOARD_EVENTS_CHANNEL);
      } catch (err) {
        logger.error({ err }, 'Failed to unsubscribe dashboard bridge');
      }
      subscriber.disconnect();
    },
  };
}
