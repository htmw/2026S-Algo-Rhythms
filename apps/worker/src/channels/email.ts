import { createTransport, type Transporter } from 'nodemailer';
import type { DeliveryChannel, DeliveryResult } from './types.js';
import { logger } from '../logger.js';

export class EmailChannel implements DeliveryChannel {
  private transport: Transporter;

  constructor() {
    this.transport = createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  async deliver(
    recipient: string,
    subject: string | null,
    body: string,
    bodyHtml: string | null,
  ): Promise<DeliveryResult> {
    try {
      await this.transport.sendMail({
        from: process.env.SMTP_FROM || 'noreply@notifyengine.dev',
        to: recipient,
        subject: subject || '(no subject)',
        text: body,
        html: bodyHtml || undefined,
      });

      return { success: true, statusCode: 200 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';

      logger.error(
        { err, recipient: recipient.substring(0, 3) + '***' },
        'Email delivery failed',
      );

      return { success: false, statusCode: 500, error: message };
    }
  }
}
