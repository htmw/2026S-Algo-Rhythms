import type { PoolClient } from 'pg';
import { RETRY_CONFIG } from '@notifyengine/shared';
import type { NotificationJob, NotificationPriority } from '@notifyengine/shared';
import { getNotificationQueue } from '../queue.js';
import { logger } from '../logger.js';

export class QueueUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Queue unavailable');
    this.name = 'QueueUnavailableError';
    this.cause = cause;
  }
}

export interface CreateNotificationParams {
  tenantId: string;
  recipient: string;
  subject?: string;
  body: string;
  bodyHtml?: string;
  priority?: NotificationPriority;
  routingMode?: 'adaptive' | 'static' | 'forced';
  channelPreference?: string[];
  forceChannel?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CreateNotificationResult {
  notificationId: string;
  createdAt: string;
  priority: NotificationPriority;
  routingMode: string;
}

export async function createAndEnqueueNotification(
  dbClient: PoolClient,
  params: CreateNotificationParams,
): Promise<CreateNotificationResult> {
  const priority: NotificationPriority = params.priority ?? 'standard';
  const routingMode = params.routingMode ?? 'adaptive';

  const result = await dbClient.query(
    `INSERT INTO notifications (
       tenant_id, idempotency_key, recipient, subject, body, body_html,
       priority, routing_mode, channel_preference, force_channel, metadata,
       status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     RETURNING id, created_at`,
    [
      params.tenantId,
      params.idempotencyKey || null,
      params.recipient,
      params.subject || null,
      params.body,
      params.bodyHtml || null,
      priority,
      routingMode,
      params.channelPreference || null,
      params.forceChannel || null,
      params.metadata ? JSON.stringify(params.metadata) : '{}',
    ],
  );

  const notificationId: string = result.rows[0].id;
  const createdAt: string = result.rows[0].created_at;

  const jobData: NotificationJob = {
    notificationId,
    tenantId: params.tenantId,
    recipient: params.recipient,
    priority,
    routingMode,
    channelPreference: params.channelPreference,
    forceChannel: params.forceChannel,
  };

  const retryConfig = RETRY_CONFIG[priority];
  const queue = getNotificationQueue(priority);
  try {
    await queue.add('deliver', jobData, {
      attempts: retryConfig.attempts,
      backoff: retryConfig.backoff,
    });
  } catch (err) {
    throw new QueueUnavailableError(err);
  }

  await dbClient.query(
    `UPDATE notifications SET status = 'queued', updated_at = NOW() WHERE id = $1`,
    [notificationId],
  ).catch((err: unknown) => {
    logger.error({ err, notificationId }, 'Status update to queued failed');
  });

  return { notificationId, createdAt, priority, routingMode };
}
