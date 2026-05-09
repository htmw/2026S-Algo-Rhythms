import { Redis } from 'ioredis';
import type { DeliveryChannel, DeliveryResult } from './types.js';
import { logger } from '../logger.js';

const DASHBOARD_CHANNEL = 'dashboard:events';

interface WebSocketDeliveryPayload {
  recipient: string;
  subject: string | null;
  body: string;
  bodyHtml: string | null;
  timestamp: string;
}

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
  ): Promise<DeliveryResult> {
    try {
      const payload: WebSocketDeliveryPayload = {
        recipient,
        subject,
        body,
        bodyHtml,
        timestamp: new Date().toISOString(),
      };

      await this.redis.publish(
        DASHBOARD_CHANNEL,
        JSON.stringify({
          event: 'websocket.delivery',
          room: `user:${recipient}`,
          payload,
        }),
      );

      return {
        success: true,
        statusCode: 200,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown WebSocket delivery error';

      logger.error(
        { err, recipient: recipient.substring(0, 3) + '***' },
        'WebSocket delivery failed',
      );

      return {
        success: false,
        error: message,
      };
    }
  }
}