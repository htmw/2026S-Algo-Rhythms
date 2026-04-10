import type { Job } from 'bullmq';
import type { NotificationJob, NotificationPriority, RoutingMode } from '@notifyengine/shared';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import { pool } from './db.js';
import { deliverEmail } from './channels/email.js';
import { logger } from './logger.js';
import {
  extractFeatures,
  type CircuitState,
  type FeatureVector,
  type RecipientChannelStatsRow,
} from './features.js';
import { predictChannel } from './mlClient.js';
import {
  buildAdaptiveDecision,
  buildAdaptiveFallbackDecision,
  buildForcedDecision,
  buildStaticDecision,
  type RoutingDecisionRecord,
} from './routingDecision.js';
import type { DashboardEventPublisher } from './dashboardEvents.js';
import { maskEmail } from './dashboardEvents.js';

interface ChannelRow {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  circuit_state: CircuitState;
  priority: number;
}

interface NotificationRow {
  recipient: string;
  subject: string | null;
  body: string;
  body_html: string | null;
}

interface StatsRow extends RecipientChannelStatsRow {
  channel_type: string;
}

const DEFAULT_EXPLORATION_RATE = 0.1;

function deriveRoutingMode(job: NotificationJob): RoutingMode {
  if (job.forceChannel) return 'forced';
  return job.routingMode ?? 'static';
}

export async function processNotification(job: Job<NotificationJob>, dashboardEvents?: DashboardEventPublisher): Promise<void> {
  const { notificationId, tenantId, priority } = job.data;
  const log = logger.child({ jobId: job.id, notificationId, tenantId, priority });

  const emitDashboard = (event: string, payload: Record<string, unknown>): void => {
    if (!dashboardEvents) return;
    try {
      dashboardEvents.emit(tenantId, event as import('@notifyengine/shared').DashboardEventName, payload);
    } catch (err) {
      log.error({ err, event }, 'Failed to emit dashboard event');
    }
  };

  const client = await pool.connect();

  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);

    await client.query(
      `UPDATE notifications SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );

    emitDashboard(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED, {
      notificationId,
      previousStatus: 'queued',
      newStatus: 'processing',
      channel: null,
      timestamp: new Date().toISOString(),
    });

    const notifResult = await client.query<NotificationRow>(
      `SELECT recipient, subject, body, body_html FROM notifications WHERE id = $1`,
      [notificationId],
    );
    const notification = notifResult.rows[0];
    if (!notification) {
      log.error('Notification not found in database');
      throw new Error(`Notification ${notificationId} not found`);
    }

    // ── Fetch eligible channels ──
    const routingMode = deriveRoutingMode(job.data);

    let channelsResult;
    if (routingMode === 'forced' && job.data.forceChannel) {
      channelsResult = await client.query<ChannelRow>(
        `SELECT id, type, label, config, circuit_state, priority
           FROM channels
          WHERE tenant_id = $1 AND type = $2 AND is_enabled = true AND circuit_state = 'closed'
          LIMIT 1`,
        [tenantId, job.data.forceChannel],
      );
    } else {
      channelsResult = await client.query<ChannelRow>(
        `SELECT id, type, label, config, circuit_state, priority
           FROM channels
          WHERE tenant_id = $1 AND is_enabled = true AND circuit_state = 'closed'
          ORDER BY priority DESC`,
        [tenantId],
      );
    }
    const eligibleChannels = channelsResult.rows;

    if (eligibleChannels.length === 0) {
      log.warn('No available channels for tenant');
      await client.query(
        `UPDATE notifications SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [notificationId],
      );
      emitDashboard(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED, {
        notificationId,
        previousStatus: 'processing',
        newStatus: 'failed',
        channel: null,
        timestamp: new Date().toISOString(),
      });
      throw new Error('No available channels');
    }

    // ── Fetch recipient stats for feature extraction ──
    const statsResult = await client.query<StatsRow>(
      `SELECT channel_type, attempts_30d, successes_30d, engagements_30d,
              avg_latency_ms, last_success_at, last_engaged_at,
              notifications_received_24h, notifications_received_7d
         FROM recipient_channel_stats
        WHERE tenant_id = $1 AND recipient = $2`,
      [tenantId, notification.recipient],
    );
    const statsByChannel = new Map<string, RecipientChannelStatsRow>();
    for (const row of statsResult.rows) {
      statsByChannel.set(row.channel_type, row);
    }

    // ── Build feature vectors per channel ──
    const featuresByChannel = new Map<string, FeatureVector>();
    for (const channel of eligibleChannels) {
      featuresByChannel.set(
        channel.type,
        extractFeatures({
          channelType: channel.type,
          priority: priority as NotificationPriority,
          bodyLength: notification.body.length,
          circuitState: channel.circuit_state,
          stats: statsByChannel.get(channel.type) ?? null,
        }),
      );
    }

    // ── Routing decision ──
    let orderedChannels = eligibleChannels;
    let routingDecision: RoutingDecisionRecord;

    if (routingMode === 'forced') {
      routingDecision = buildForcedDecision(eligibleChannels[0].type);
    } else if (routingMode === 'static') {
      const preference = job.data.channelPreference;
      if (preference && preference.length > 0) {
        orderedChannels = [...eligibleChannels].sort((a, b) => {
          const aIdx = preference.indexOf(a.type);
          const bIdx = preference.indexOf(b.type);
          const aPos = aIdx === -1 ? Infinity : aIdx;
          const bPos = bIdx === -1 ? Infinity : bIdx;
          return aPos - bPos;
        });
      }
      routingDecision = buildStaticDecision(orderedChannels[0].type);
    } else {
      // adaptive
      const featuresPerChannel: Record<string, FeatureVector> = {};
      for (const [k, v] of featuresByChannel.entries()) {
        featuresPerChannel[k] = v;
      }
      const ml = await predictChannel({
        recipient: notification.recipient,
        available_channels: eligibleChannels.map((c) => c.type),
        features_per_channel: featuresPerChannel,
        exploration_rate: DEFAULT_EXPLORATION_RATE,
      });

      if (ml && featuresByChannel.has(ml.selected)) {
        orderedChannels = [
          ...eligibleChannels.filter((c) => c.type === ml.selected),
          ...eligibleChannels.filter((c) => c.type !== ml.selected),
        ];
        routingDecision = buildAdaptiveDecision(ml);
      } else {
        log.warn('Adaptive routing falling back to static priority order');
        routingDecision = buildAdaptiveFallbackDecision(
          orderedChannels[0].type,
          'ML service unreachable; fell back to static priority order',
        );
      }
    }

    // Persist routing_decision on the notification record
    await client.query(
      `UPDATE notifications SET routing_decision = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [notificationId, JSON.stringify(routingDecision)],
    );

    // ── Try each channel in order ──
    for (const channel of orderedChannels) {
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
        log.info(
          { channelType: channel.type, channelId: channel.id },
          'Channel type not yet implemented - skipping',
        );
        continue;
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const attemptStatus = success ? 'success' : 'failure';
      const featureVector = featuresByChannel.get(channel.type) ?? null;

      // ── Atomic: delivery_attempt + recipient_channel_stats ──
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO delivery_attempts (
             tenant_id, notification_id, channel_id, channel_type,
             attempt_number, status, status_code, error_message,
             started_at, completed_at, duration_ms, feature_vector
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
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
            featureVector ? JSON.stringify(featureVector) : null,
          ],
        );

        await client.query(
          `INSERT INTO recipient_channel_stats (
             tenant_id, recipient, channel_type,
             attempts_30d, successes_30d, engagements_30d,
             avg_latency_ms,
             last_success_at, last_failure_at,
             notifications_received_24h, notifications_received_7d,
             updated_at
           ) VALUES ($1, $2, $3, 1, $4, 0, $5,
             CASE WHEN $4 = 1 THEN NOW() ELSE NULL END,
             CASE WHEN $4 = 0 THEN NOW() ELSE NULL END,
             1, 1, NOW()
           )
           ON CONFLICT (tenant_id, recipient, channel_type)
           DO UPDATE SET
             attempts_30d = recipient_channel_stats.attempts_30d + 1,
             successes_30d = recipient_channel_stats.successes_30d + $4,
             avg_latency_ms = CASE
               WHEN recipient_channel_stats.avg_latency_ms IS NULL THEN $5
               ELSE (recipient_channel_stats.avg_latency_ms * recipient_channel_stats.attempts_30d + $5)
                    / (recipient_channel_stats.attempts_30d + 1)
             END,
             last_success_at = CASE
               WHEN $4 = 1 THEN NOW()
               ELSE recipient_channel_stats.last_success_at
             END,
             last_failure_at = CASE
               WHEN $4 = 0 THEN NOW()
               ELSE recipient_channel_stats.last_failure_at
             END,
             notifications_received_24h = recipient_channel_stats.notifications_received_24h + 1,
             notifications_received_7d = recipient_channel_stats.notifications_received_7d + 1,
             updated_at = NOW()`,
          [
            tenantId,
            notification.recipient,
            channel.type,
            success ? 1 : 0,
            durationMs,
          ],
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      emitDashboard(DASHBOARD_EVENTS.DELIVERY_COMPLETED, {
        notificationId,
        recipient: maskEmail(notification.recipient),
        channel: channel.type,
        status: attemptStatus,
        statusCode,
        durationMs,
        attemptNumber: job.attemptsMade + 1,
        routing: {
          mode: routingDecision.mode,
          exploration: routingDecision.exploration ?? false,
          modelVersion: routingDecision.model_version ?? null,
        },
        priority,
        timestamp: completedAt.toISOString(),
      });

      await client.query(
        `INSERT INTO recipient_channel_stats (
           tenant_id,
           recipient,
           channel_type,
           attempts_30d,
           successes_30d,
           engagements_30d,
           avg_latency_ms,
           last_success_at,
           last_failure_at,
           notifications_received_24h,
           notifications_received_7d,
           updated_at
         )
         VALUES (
           $1,
           $2,
           $3,
           1,
           $4,
           0,
           $5,
           CASE WHEN $4 = 1 THEN NOW() ELSE NULL END,
           CASE WHEN $4 = 0 THEN NOW() ELSE NULL END,
           1,
           1,
           NOW()
         )
         ON CONFLICT (tenant_id, recipient, channel_type)
         DO UPDATE SET
           attempts_30d = recipient_channel_stats.attempts_30d + 1,
           successes_30d = recipient_channel_stats.successes_30d + $4,
           avg_latency_ms =
             CASE
               WHEN recipient_channel_stats.avg_latency_ms IS NULL THEN $5
               ELSE (
                 (recipient_channel_stats.avg_latency_ms * recipient_channel_stats.attempts_30d) + $5
               ) / (recipient_channel_stats.attempts_30d + 1)
             END,
           last_success_at =
             CASE
               WHEN $4 = 1 THEN NOW()
               ELSE recipient_channel_stats.last_success_at
             END,
           last_failure_at =
             CASE
               WHEN $4 = 0 THEN NOW()
               ELSE recipient_channel_stats.last_failure_at
             END,
           notifications_received_24h = recipient_channel_stats.notifications_received_24h + 1,
           notifications_received_7d = recipient_channel_stats.notifications_received_7d + 1,
           updated_at = NOW()`,
        [
          tenantId,
          notification.recipient,
          channel.type,
          success ? 1 : 0,
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
        emitDashboard(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED, {
          notificationId,
          previousStatus: 'processing',
          newStatus: 'delivered',
          channel: channel.type,
          timestamp: new Date().toISOString(),
        });
        log.info({ channelType: channel.type, durationMs }, 'Notification delivered');
        return;
      }

      log.warn(
        { channelType: channel.type, error: errorMessage, durationMs },
        'Channel delivery failed - trying next',
      );
    }

    await client.query(
      `UPDATE notifications SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [notificationId],
    );
    emitDashboard(DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED, {
      notificationId,
      previousStatus: 'processing',
      newStatus: 'failed',
      channel: null,
      timestamp: new Date().toISOString(),
    });
    log.error('All channels exhausted');
    throw new Error('All channels exhausted');
  } finally {
    await client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
    client.release();
  }
}
