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

  // Both delivery_attempts and recipient_channel_stats have RLS with
  // FORCE ROW LEVEL SECURITY. We need a dedicated connection with
  // tenant context set via set_config. Look up the tenant_id from
  // the delivery_attempts row joined to its notification.
  let client;
  try {
    client = await pool.connect();

    // Look up tenant_id, recipient, and channel_type for this notification
    const lookup = await client.query(
      `SELECT da.tenant_id, n.recipient, da.channel_type
       FROM delivery_attempts da
       JOIN notifications n ON n.id = da.notification_id
       WHERE da.notification_id = $1
       LIMIT 1`,
      [notificationId],
    );

    if (lookup.rows.length === 0) {
      // No delivery attempt found — return pixel without updating
      client.release();
      res.status(200).end(PIXEL);
      return;
    }

    const { tenant_id: tenantId, recipient, channel_type: channelType } = lookup.rows[0];

    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);

    await client.query(
      `UPDATE delivery_attempts
       SET engaged = true,
           engaged_at = NOW(),
           engagement_type = 'email_open'
       WHERE notification_id = $1
         AND engaged IS NOT TRUE`,
      [notificationId],
    );
    await pool.query(
      `UPDATE recipient_channel_stats rcs
       SET engagements_30d = rcs.engagements_30d + 1,
           last_engaged_at = NOW(),
           updated_at = NOW()
       FROM delivery_attempts da
       WHERE da.notification_id = $1
         AND da.channel_type = rcs.channel_type
         AND da.tenant_id = rcs.tenant_id
         AND rcs.recipient = (
           SELECT recipient FROM notifications WHERE id = $1
         )`,
      [notificationId],
    );

    // UPSERT recipient_channel_stats: handles the case where the rcs row
    // doesn't exist yet (tracking pixel fires before worker creates it,
    // or legacy delivery_attempts from before inline stats).
    await client.query(
      `INSERT INTO recipient_channel_stats (
         tenant_id, recipient, channel_type,
         attempts_30d, successes_30d, engagements_30d,
         last_engaged_at, updated_at
       ) VALUES ($1, $2, $3, 0, 0, 1, NOW(), NOW())
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
