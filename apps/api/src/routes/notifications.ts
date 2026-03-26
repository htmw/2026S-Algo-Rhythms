import { Router } from 'express';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { RETRY_CONFIG } from '@notifyengine/shared';
import type { NotificationJob, NotificationPriority } from '@notifyengine/shared';
import { SendNotificationSchema, ListNotificationsQuerySchema } from '../schemas/notification.js';
import type { ListNotificationsQuery } from '../schemas/notification.js';
import { getNotificationQueue } from '../queue.js';
import { logger } from '../logger.js';


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notificationRouter = Router();

// ─────────────────────────────────────────────────────────────
// POST /v1/notifications
// ─────────────────────────────────────────────────────────────
notificationRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

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
    logger.error({ err, requestId, tenantId, notificationId }, 'Queue failed');
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Queue unavailable. Retry later.' },
      request_id: requestId,
    });
    return;
  }
  try {
    await dbClient.query(
      `UPDATE notifications SET status = 'queued', updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Status update failed');
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

// ── GET /v1/notifications ──
notificationRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

  // ── Validate query params ──
  let parsed: ListNotificationsQuery;
  try {
    parsed = ListNotificationsQuerySchema.parse(req.query);
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

  const { status, cursor, limit } = parsed;

  // ── Build query dynamically ──
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  if (cursor) {
    conditions.push(`created_at < $${paramIndex++}`);
    params.push(cursor);
  }

  // fetch limit+1 to detect if next page exists
  params.push(limit + 1);
  const limitParam = `$${paramIndex}`;

  try {
    const result = await dbClient.query<{
      id: string;
      recipient: string;
      channel_preference: string[] | null;
      force_channel: string | null;
      routing_mode: string;
      subject: string | null;
      priority: string;
      status: string;
      delivered_via: string | null;
      delivered_at: string | null;
      failed_at: string | null;
      metadata: Record<string, unknown>;
      routing_decision: Record<string, unknown> | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         id, recipient, channel_preference, force_channel,
         routing_mode, subject, priority, status,
         delivered_via, delivered_at, failed_at,
         metadata, routing_decision, created_at, updated_at
       FROM notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ${limitParam}`,
      params,
    );

    const hasNextPage = result.rows.length > limit;
    const items = hasNextPage ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = hasNextPage ? items[items.length - 1].created_at : null;

    logger.info({ requestId, tenantId, count: items.length }, 'Notifications listed');

    res.status(200).json({
      data: items,
      pagination: {
        nextCursor,
        hasNextPage,
        limit,
      },
      request_id: requestId,
    });
  } catch (err) {
    logger.error({ err, requestId, tenantId }, 'Failed to list notifications');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
  }
});

// ── GET /v1/notifications/:id ──
notificationRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Invalid notification ID format.' },
      request_id: requestId,
    });
    return;
  }

  try {
    const notifResult = await dbClient.query(
      `SELECT id, tenant_id, status, recipient, subject, priority, routing_mode,
              delivered_via, delivered_at, failed_at, routing_decision,
              metadata, created_at, updated_at
       FROM notifications
       WHERE id = $1`,
      [id],
    );

    if (notifResult.rows.length === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Notification not found.' },
        request_id: requestId,
      });
      return;
    }

    const notification = notifResult.rows[0];

    if (notification.tenant_id !== tenantId) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied for this notification.' },
        request_id: requestId,
      });
      return;
    }

    const attemptsResult = await dbClient.query(
      `SELECT channel_type, attempt_number, status, status_code,
              error_message, engaged, engagement_type, engaged_at,
              started_at, completed_at, duration_ms
       FROM delivery_attempts
       WHERE notification_id = $1
       ORDER BY attempt_number ASC`,
      [id],
    );

    const { tenant_id, ...notificationData } = notification;

    res.status(200).json({
      ...notificationData,
      delivery_attempts: attemptsResult.rows,
      request_id: requestId,
    });
  } catch (err) {
    logger.error({ err, requestId, notificationId: id }, 'Fetch failed');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
  }
});