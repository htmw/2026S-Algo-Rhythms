import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db.js';
import { logger } from '../logger.js';

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

  try {
    // No auth/RLS on this endpoint - tracking pixel is hit by email clients.
    // Uses pool.query() directly (no tenant context needed for this UPDATE).
    await pool.query(
      `UPDATE delivery_attempts
       SET engaged = true,
           engaged_at = NOW(),
           engagement_type = 'email_open'
       WHERE notification_id = $1
         AND engaged IS NOT TRUE`,
      [notificationId],
    );

    // Update recipient_channel_stats for engagement
    await pool.query(
      `UPDATE recipient_channel_stats rcs
       SET engagements_30d = rcs.engagements_30d + 1,
           last_engaged_at = NOW(),
           updated_at = NOW()
       FROM delivery_attempts da
       JOIN notifications n ON n.id = da.notification_id
       WHERE da.notification_id = $1
         AND da.status = 'success'
         AND rcs.tenant_id = da.tenant_id
         AND rcs.recipient = n.recipient
         AND rcs.channel_type = da.channel_type`,
      [notificationId],
    );

    logger.info({ requestId, notificationId }, 'Email open tracked');
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Failed to track email open');
  }

  res.status(200).end(PIXEL);
});
