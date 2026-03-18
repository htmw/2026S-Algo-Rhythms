import { Router } from 'express';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { RETRY_CONFIG } from '@notifyengine/shared';
import type { NotificationJob, NotificationPriority } from '@notifyengine/shared';
import { SendNotificationSchema } from '../schemas/notification.js';
import { getNotificationQueue } from '../queue.js';
import { logger } from '../logger.js';

export const notificationRouter = Router();

notificationRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

  // ── Validate request body ──
  let parsed;
  try {
    parsed = SendNotificationSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message },
        request_id: requestId,
      });
      return;
    }
    throw err;
  }

  // ── Idempotency check ──
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (idempotencyKey) {
    try {
      const existing = await dbClient.query(
        `SELECT id, status, priority, routing_mode, created_at
         FROM notifications
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      );

      if (existing.rows[0]) {
        const row = existing.rows[0];
        res.status(200).json({
          id: row.id,
          status: row.status,
          priority: row.priority,
          routing_mode: row.routing_mode,
          created_at: row.created_at,
          status_url: `/v1/notifications/${row.id}`,
          request_id: requestId,
        });
        return;
      }
    } catch (err) {
      logger.error({ err, requestId, tenantId }, 'Idempotency lookup failed');
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
        request_id: requestId,
      });
      return;
    }
  }

  // ── Insert notification ──
  let notificationId: string;
  let createdAt: string;
  try {
    const result = await dbClient.query(
      `INSERT INTO notifications (
         tenant_id, idempotency_key, recipient, subject, body, body_html,
         priority, routing_mode, channel_preference, force_channel, metadata, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
       RETURNING id, created_at`,
      [
        tenantId,
        idempotencyKey || null,
        parsed.recipient,
        parsed.subject || null,
        parsed.body,
        parsed.body_html || null,
        parsed.priority,
        parsed.routing_mode,
        parsed.channel_preference || null,
        parsed.force_channel || null,
        parsed.metadata ? JSON.stringify(parsed.metadata) : '{}',
      ],
    );
    notificationId = result.rows[0].id;
    createdAt = result.rows[0].created_at;
  } catch (err) {
    logger.error({ err, requestId, tenantId }, 'Failed to insert notification');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
    return;
  }

  // ── Enqueue to BullMQ ──
  const priority = parsed.priority as NotificationPriority;
  const jobData: NotificationJob = {
    notificationId,
    tenantId,
    recipient: parsed.recipient,
    priority,
    routingMode: parsed.routing_mode,
    channelPreference: parsed.channel_preference,
    forceChannel: parsed.force_channel,
  };

  const retryConfig = RETRY_CONFIG[priority];

  try {
    const queue = getNotificationQueue(priority);
    await queue.add('deliver', jobData, {
      attempts: retryConfig.attempts,
      backoff: retryConfig.backoff,
    });
  } catch (err) {
    logger.error({ err, requestId, tenantId, notificationId }, 'Failed to enqueue notification — Redis may be down');
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Queue service is temporarily unavailable. Retry later.' },
      request_id: requestId,
    });
    return;
  }

  // ── Update status to queued ──
  try {
    await dbClient.query(
      `UPDATE notifications SET status = 'queued', updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Failed to update notification status to queued');
  }

  logger.info({ requestId, tenantId, notificationId, priority: parsed.priority }, 'Notification queued');

  res.status(202).json({
    id: notificationId,
    status: 'queued',
    priority: parsed.priority,
    routing_mode: parsed.routing_mode,
    created_at: createdAt,
    status_url: `/v1/notifications/${notificationId}`,
    request_id: requestId,
  });
});
