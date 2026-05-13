import { logger } from '../logger.js';

export interface SmsMockResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function deliverSmsMock(
  recipient: string,
  body: string,
): Promise<SmsMockResult> {
  try {
    logger.info(
      {
        recipient: recipient.substring(0, 3) + '***',
        bodyLength: body.length,
        channel: 'sms_webhook',
      },
      'Mock SMS delivered',
    );

    return {
      success: true,
      statusCode: 200,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMS mock error';

    logger.error(
      {
        err,
        recipient: recipient.substring(0, 3) + '***',
      },
      'Mock SMS delivery failed',
    );

    return {
      success: false,
      error: message,
    };
  }
}
