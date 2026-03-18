import { createTransport } from 'nodemailer';
import { logger } from '../logger.js';

const transport = createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025', 10),
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export interface EmailResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function deliverEmail(
  recipient: string,
  subject: string | null,
  body: string,
  bodyHtml: string | null,
): Promise<EmailResult> {
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'noreply@notifyengine.dev',
      to: recipient,
      subject: subject || '(no subject)',
      text: body,
      html: bodyHtml || undefined,
    });
    return { success: true, statusCode: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error';
    logger.error({ err, recipient: recipient.substring(0, 3) + '***' }, 'Email delivery failed');
    return { success: false, error: message };
  }
}
