import { Redis } from 'ioredis';
import type { DeliveryChannel, DeliveryContext, DeliveryResult } from './types.js';
import { logger } from '../logger.js';

const NOTIFICATIONS_CHANNEL = 'notifications:delivery';

export class WebSocketChannel implements DeliveryChannel {
  private redis: Redis;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });

    this.redis.on('error', (err) => {
      logger.error({ err }, 'WebSocket delivery Redis publisher error');
    });
  }

  async deliver(
    recipient: string,
    subject: string | null,
    body: string,
    bodyHtml: string | null,
    context?: DeliveryContext,
  ): Promise<DeliveryResult> {
    try {
      await this.redis.publish(
        NOTIFICATIONS_CHANNEL,
        JSON.stringify({
          notificationId: context?.notificationId ?? null,
          tenantId: context?.tenantId ?? null,
          recipientId: recipient,
          room: `user:${recipient}`,
          payload: {
            subject,
            body,
            bodyHtml,
            timestamp: new Date().toISOString(),
          },
        }),
      );

      return { success: true, statusCode: 200 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown WebSocket delivery error';

      logger.error(
        { err, recipient: recipient.substring(0, 3) + '***' },
        'WebSocket delivery failed',
      );

      return { success: false, error: message };
    }
  }
}
