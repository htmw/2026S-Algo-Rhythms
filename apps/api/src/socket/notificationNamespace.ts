import type { Server, Namespace, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { emitDashboardEvent, maskEmail } from './apiEmitter.js';

const NOTIFICATION_CHANNEL = 'notifications:delivery';
const WS_CONNECTED_KEY = 'ws:connected_recipients';
const ACK_TIMEOUT_MS = 30_000;

const NotificationMessageSchema = z.object({
  notificationId: z.string(),
  tenantId: z.string(),
  recipientId: z.string(),
  room: z.string(),
  payload: z.object({
    subject: z.string().nullable(),
    body: z.string(),
    bodyHtml: z.string().nullable(),
    timestamp: z.string(),
  }),
});

export function registerNotificationNamespace(io: Server, redis?: Redis): Namespace {
  const nsp = io.of('/notifications');
  const presenceRedis = redis ?? new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null },
  );

  nsp.on('connection', (socket: Socket) => {
    const recipientId = socket.handshake.auth?.recipientId as string | undefined;

    if (!recipientId) {
      socket.disconnect(true);
      return;
    }

    const room = `user:${recipientId}`;
    void socket.join(room);
    void presenceRedis.sadd(WS_CONNECTED_KEY, recipientId);

    logger.info(
      { recipientId, socketId: socket.id },
      'Recipient connected to notifications namespace',
    );

    socket.on('disconnect', async () => {
      const socketsInRoom = await nsp.in(room).allSockets();
      if (socketsInRoom.size === 0) {
        void presenceRedis.srem(WS_CONNECTED_KEY, recipientId);
      }

      logger.info(
        { recipientId, socketId: socket.id },
        'Recipient disconnected from notifications namespace',
      );
    });
  });

  return nsp;
}

export async function startNotificationBridge(namespace: Namespace): Promise<void> {
  const subscriber = new Redis(
    process.env.REDIS_PUBSUB_URL || process.env.REDIS_URL || 'redis://localhost:6379',
    { maxRetriesPerRequest: null },
  );

  subscriber.on('error', (err) => {
    logger.error({ err }, 'Notification bridge Redis subscriber error');
  });

  await subscriber.subscribe(NOTIFICATION_CHANNEL);
  logger.info({ channel: NOTIFICATION_CHANNEL }, 'Notification bridge subscribed');

  subscriber.on('message', (_channel, raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn({ rawPreview: raw.slice(0, 200) }, 'Notification message is not valid JSON');
      return;
    }

    const result = NotificationMessageSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        { error: result.error.message, rawPreview: raw.slice(0, 200) },
        'Invalid notification delivery message',
      );
      return;
    }

    const message = result.data;

    namespace.to(message.room).emit('notification:delivered', {
      notificationId: message.notificationId,
      ...message.payload,
    });

    void setupAckListeners(namespace, message);
  });
}

async function setupAckListeners(
  namespace: Namespace,
  message: z.infer<typeof NotificationMessageSchema>,
): Promise<void> {
  const socketIds = await namespace.in(message.room).allSockets();
  const ackEvent = `ack:${message.notificationId}`;

  for (const socketId of socketIds) {
    const socket = namespace.sockets.get(socketId);
    if (!socket) continue;

    const timeout = setTimeout(() => {
      socket.removeListener(ackEvent, handler);
    }, ACK_TIMEOUT_MS);

    const handler = (): void => {
      clearTimeout(timeout);
      void recordWsEngagement(message);
    };

    socket.once(ackEvent, handler);
  }
}

const ENGAGEMENT_RETRY_DELAY_MS = 500;
const ENGAGEMENT_MAX_RETRIES = 5;

async function recordWsEngagement(
  message: z.infer<typeof NotificationMessageSchema>,
  attempt = 0,
): Promise<void> {
  let client;
  try {
    client = await pool.connect();

    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, false)",
      [message.tenantId],
    );

    const updateResult = await client.query(
      `UPDATE delivery_attempts
       SET engaged = true,
           engaged_at = NOW(),
           engagement_type = 'ws_ack'
       WHERE notification_id = $1
         AND channel_type = 'websocket'
         AND engaged IS NOT TRUE`,
      [message.notificationId],
    );

    // The worker inserts the delivery_attempts row AFTER publishing to Redis,
    // so the ack can arrive before the row exists.
    if (updateResult.rowCount === 0 && attempt < ENGAGEMENT_MAX_RETRIES) {
      client.release();
      client = undefined;
      await new Promise((r) => setTimeout(r, ENGAGEMENT_RETRY_DELAY_MS));
      return recordWsEngagement(message, attempt + 1);
    }

    if (updateResult.rowCount === 0) {
      logger.warn(
        { notificationId: message.notificationId, attempts: attempt + 1 },
        'WebSocket ack engagement: delivery_attempts row not found after retries',
      );
      return;
    }

    await client.query(
      `INSERT INTO recipient_channel_stats (
         tenant_id, recipient, channel_type,
         attempts_30d, successes_30d, engagements_30d,
         last_engaged_at, updated_at
       )
       VALUES ($1, $2, 'websocket', 0, 0, 1, NOW(), NOW())
       ON CONFLICT (tenant_id, recipient, channel_type)
       DO UPDATE SET
         engagements_30d = recipient_channel_stats.engagements_30d + 1,
         last_engaged_at = NOW(),
         updated_at = NOW()`,
      [message.tenantId, message.recipientId],
    );

    emitDashboardEvent(message.tenantId, DASHBOARD_EVENTS.ENGAGEMENT_RECORDED, {
      notificationId: message.notificationId,
      recipient: maskEmail(message.recipientId),
      channel: 'websocket',
      engagementType: 'ws_ack',
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { notificationId: message.notificationId, attempts: attempt + 1 },
      'WebSocket ack engagement recorded',
    );
  } catch (err) {
    logger.error(
      { err, notificationId: message.notificationId },
      'Failed to record WebSocket engagement',
    );
  } finally {
    if (client) {
      await client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
      client.release();
    }
  }
}
