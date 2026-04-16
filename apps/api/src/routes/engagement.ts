import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { DASHBOARD_EVENTS } from '@notifyengine/shared';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { emitDashboardEvent, maskEmail } from '../socket/apiEmitter.js';

export const engagementRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
  'base64',
);

engagementRouter.get('/track', async (req: Request, res: Response): Promise<void> => {
  const requestId = crypto.randomUUID();
  const notificationId = req.query.nid as string | undefined;

  // Always return the pixel regardless of outcome
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store');

  if (!notificationId || !UUID_REGEX.test(notificationId)) {
    res.status(200).end(PIXEL);
    return;
  }

  let client;
  try {
    client = await pool.connect();

    // Discover the owning tenant via a SECURITY DEFINER function so we can set
    // RLS context. All subsequent queries run under normal tenant-scoped policies.
    const tenantLookup = await client.query<{ tenant_id: string | null }>(
      'SELECT get_tenant_for_notification($1) AS tenant_id',
      [notificationId],
    );

    const tenantId = tenantLookup.rows[0]?.tenant_id;
    if (!tenantId) {
      res.status(200).end(PIXEL);
      return;
    }

    // Set tenant context for RLS
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);

    // Now fetch recipient + channel_type under tenant-scoped RLS
    const detailLookup = await client.query<{
      recipient: string;
      channel_type: string;
    }>(
      `SELECT n.recipient, da.channel_type
       FROM notifications n
       JOIN delivery_attempts da ON da.notification_id = n.id
       WHERE n.id = $1
       LIMIT 1`,
      [notificationId],
    );

    if (detailLookup.rows.length === 0) {
      res.status(200).end(PIXEL);
      return;
    }

    const { recipient, channel_type: channelType } = detailLookup.rows[0];

    // Update delivery_attempts engagement
    await client.query(
      `UPDATE delivery_attempts
       SET engaged = true,
           engaged_at = NOW(),
           engagement_type = 'email_open'
       WHERE notification_id = $1
         AND engaged IS NOT TRUE`,
      [notificationId],
    );

    // UPSERT into recipient_channel_stats (single correct update path)
    await client.query(
      `INSERT INTO recipient_channel_stats (
         tenant_id,
         recipient,
         channel_type,
         attempts_30d,
         successes_30d,
         engagements_30d,
         last_engaged_at,
         updated_at
       )
       VALUES ($1, $2, $3, 0, 0, 1, NOW(), NOW())
       ON CONFLICT (tenant_id, recipient, channel_type)
       DO UPDATE SET
         engagements_30d = recipient_channel_stats.engagements_30d + 1,
         last_engaged_at = NOW(),
         updated_at = NOW()`,
      [tenantId, recipient, channelType],
    );

    emitDashboardEvent(tenantId, DASHBOARD_EVENTS.ENGAGEMENT_RECORDED, {
      notificationId,
      recipient: maskEmail(recipient),
      channel: channelType,
      engagementType: 'email_open',
      timestamp: new Date().toISOString(),
    });

    logger.info({ requestId, notificationId }, 'Email open tracked');
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Failed to track email open');
  } finally {
    if (client) {
      await client.query("SELECT set_config('app.current_tenant_id', '', false)").catch(() => {});
      client.release();
    }
  }

  res.status(200).end(PIXEL);
});