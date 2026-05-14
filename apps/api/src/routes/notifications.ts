import { Router } from 'express';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import { SendNotificationSchema, ListNotificationsQuerySchema } from '../schemas/notification.js';
import type { ListNotificationsQuery } from '../schemas/notification.js';
import { createAndEnqueueNotification, QueueUnavailableError } from '../services/notificationService.js';
import { logger } from '../logger.js';
import { emitDashboardEvent, maskEmail } from '../socket/apiEmitter.js';


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
  let priority: string;
  let routingMode: string;

  try {
    const result = await createAndEnqueueNotification(dbClient, {
      tenantId,
      recipient: parsed.recipient,
      subject: parsed.subject,
      body: parsed.body,
      bodyHtml: parsed.body_html,
      priority: parsed.priority as 'critical' | 'high' | 'standard' | 'bulk',
      routingMode: parsed.routing_mode,
      channelPreference: parsed.channel_preference,
      forceChannel: parsed.force_channel,
      metadata: parsed.metadata as Record<string, unknown> | undefined,
      idempotencyKey: idempotencyKey,
    });
    notificationId = result.notificationId;
    createdAt = result.createdAt;
    priority = result.priority;
    routingMode = result.routingMode;
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      logger.error({ err: err.cause, requestId, tenantId }, 'Queue failed');
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Queue unavailable. Retry later.' },
        request_id: requestId,
      });
      return;
    }
    logger.error({ err, requestId, tenantId }, 'Failed to create notification');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
    return;
  }

  logger.info({ requestId, tenantId, notificationId, priority }, 'Notification queued');

  res.status(202).json({
    id: notificationId,
    status: 'queued',
    priority,
    routing_mode: routingMode,
    created_at: createdAt,
    status_url: `/v1/notifications/${notificationId}`,
    request_id: requestId,
  });

  try {
    emitDashboardEvent(tenantId, DASHBOARD_EVENTS.NOTIFICATION_ENQUEUED, {
      notificationId,
      recipient: maskEmail(parsed.recipient),
      priority: parsed.priority,
      routingMode: parsed.routing_mode,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Failed to emit enqueued dashboard event');
  }
});

// ── GET /v1/notifications/summary ──
notificationRouter.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

  try {
    const result = await dbClient.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
       FROM notifications
       WHERE tenant_id = $1`,
      [tenantId],
    );

    res.status(200).json({
      ...result.rows[0],
      request_id: requestId,
    });
  } catch (err) {
    logger.error({ err, requestId, tenantId }, 'Failed to fetch notification summary');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
  }
});

// ── GET /v1/notifications ──
notificationRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;

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

  params.push(limit + 1);
  const limitParam = `$${paramIndex}`;

  try {
    const result = await dbClient.query(
      `SELECT
         id, recipient, channel_preference, force_channel,
         routing_mode, subject, priority, status,
         delivered_via, delivered_at, failed_at,
         metadata, routing_decision, content_classification,
         created_at, updated_at
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
              content_classification, metadata, created_at, updated_at
       FROM notifications
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
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
              error_message, engaged, engagement_type, engagement_reason,
              engaged_at, started_at, completed_at, duration_ms, feature_vector
       FROM delivery_attempts
       WHERE notification_id = $1 AND tenant_id = $2
       ORDER BY attempt_number ASC`,
      [id, tenantId],
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