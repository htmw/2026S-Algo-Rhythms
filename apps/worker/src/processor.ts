import type { Job } from 'bullmq';
import type { NotificationJob } from '@notifyengine/shared';
import { pool } from './db.js';
import { deliverEmail } from './channels/email.js';
import { logger } from './logger.js';

interface ChannelRow {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

interface NotificationRow {
  recipient: string;
  subject: string | null;
  body: string;
  body_html: string | null;
}

export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { notificationId, tenantId, priority } = job.data;
  const log = logger.child({ jobId: job.id, notificationId, tenantId, priority });

  const client = await pool.connect();

  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);

    // Mark as processing
    await client.query(
      `UPDATE notifications SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );

    // Fetch notification content
    const notifResult = await client.query<NotificationRow>(
      `SELECT recipient, subject, body, body_html FROM notifications WHERE id = $1`,
      [notificationId],
    );
    const notification = notifResult.rows[0];
    if (!notification) {
      log.error('Notification not found in database');
      throw new Error(`Notification ${notificationId} not found`);
    }

    // ── Channel selection ──
    // Sprint 1: all routing modes (adaptive, static, forced) use static channel
    // priority ordering. Sprint 2 will replace the adaptive branch with an HTTP
    // call to the ML service (POST http://ml-service:8000/predict) to get
    // per-channel engagement probabilities and apply epsilon-greedy exploration.
    let channels: ChannelRow[];

    if (job.data.forceChannel) {
      // forced mode: single channel, no fallback
      const result = await client.query<ChannelRow>(
        `SELECT id, type, label, config FROM channels
         WHERE tenant_id = $1 AND type = $2 AND is_enabled = true AND circuit_state = 'closed'
         LIMIT 1`,
        [tenantId, job.data.forceChannel],
      );
      channels = result.rows;
    } else if (job.data.channelPreference && job.data.channelPreference.length > 0) {
      // static mode with explicit preference order
      const result = await client.query<ChannelRow>(
        `SELECT id, type, label, config FROM channels
         WHERE tenant_id = $1 AND is_enabled = true AND circuit_state = 'closed'
         ORDER BY priority DESC`,
        [tenantId],
      );
      const preferenceOrder = job.data.channelPreference;
      channels = result.rows.sort((a, b) => {
        const aIdx = preferenceOrder.indexOf(a.type);
        const bIdx = preferenceOrder.indexOf(b.type);
        const aPos = aIdx === -1 ? Infinity : aIdx;
        const bPos = bIdx === -1 ? Infinity : bIdx;
        return aPos - bPos;
      });
    } else {
      // adaptive (Sprint 1 fallback) and default static: priority DESC
      const result = await client.query<ChannelRow>(
        `SELECT id, type, label, config FROM channels
         WHERE tenant_id = $1 AND is_enabled = true AND circuit_state = 'closed'
         ORDER BY priority DESC`,
        [tenantId],
      );
      channels = result.rows;
    }

    if (channels.length === 0) {
      log.warn('No available channels for tenant');
      await client.query(
        `UPDATE notifications SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [notificationId],
      );
      throw new Error('No available channels');
    }

    // ── Try each channel in order ──
    for (const channel of channels) {
      const startedAt = new Date();
      let success = false;
      let statusCode: number | null = null;
      let errorMessage: string | null = null;

      if (channel.type === 'email') {
        const result = await deliverEmail(
          notification.recipient,
          notification.subject,
          notification.body,
          notification.body_html,
        );
        success = result.success;
        statusCode = result.statusCode ?? null;
        errorMessage = result.error ?? null;
      } else {
        // Sprint 1: only email is implemented
        log.info({ channelType: channel.type, channelId: channel.id }, 'Channel type not yet implemented — skipping');
        continue;
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const attemptStatus = success ? 'success' : 'failure';

      // Record delivery attempt
      await client.query(
        `INSERT INTO delivery_attempts (
           tenant_id, notification_id, channel_id, channel_type,
           attempt_number, status, status_code, error_message,
           started_at, completed_at, duration_ms
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId,
          notificationId,
          channel.id,
          channel.type,
          job.attemptsMade + 1,
          attemptStatus,
          statusCode,
          errorMessage,
          startedAt,
          completedAt,
          durationMs,
        ],
      );

      if (success) {
        await client.query(
          `UPDATE notifications
           SET status = 'delivered', delivered_via = $2, delivered_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [notificationId, channel.type],
        );
        log.info({ channelType: channel.type, durationMs }, 'Notification delivered');
        return;
      }

      log.warn({ channelType: channel.type, error: errorMessage, durationMs }, 'Channel delivery failed — trying next');
    }

    // All channels exhausted
    await client.query(
      `UPDATE notifications SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );
    log.error('All channels exhausted');
    throw new Error('All channels exhausted');
  } finally {
    await client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
    client.release();
  }
}
