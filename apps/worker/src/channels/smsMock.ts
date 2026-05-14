import type { DeliveryChannel, DeliveryResult } from './types.js';
import { logger } from '../logger.js';

export class SmsMockChannel implements DeliveryChannel {
  async deliver(
    recipient: string,
    _subject: string | null,
    body: string,
    _bodyHtml: string | null,
  ): Promise<DeliveryResult> {
    try {
      logger.info(
        {
          recipient: recipient.substring(0, 3) + '***',
          bodyLength: body.length,
          channel: 'sms_webhook',
        },
        'Mock SMS delivered',
      );

      return { success: true, statusCode: 200 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown SMS mock error';

      logger.error(
        { err, recipient: recipient.substring(0, 3) + '***' },
        'Mock SMS delivery failed',
      );

      return { success: false, error: message };
    }
  }
}
