import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger.js';

export const engagementRouter = Router();

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
  'base64'
);

engagementRouter.get('/track', async (req: Request, res: Response): Promise<void> => {
  const { requestId, dbClient } = req;
  const notificationId = req.query.nid as string | undefined;

  // Always return GIF
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store');

  // If no ID → do nothing
  if (!notificationId) {
    res.status(204).end(PIXEL);
    return;
  }

  try {
    await dbClient.query(
      `
      UPDATE delivery_attempts
      SET engaged = true,
          engaged_at = NOW(),
          engagement_type = 'email_open'
      WHERE notification_id = $1
        AND engaged IS NOT TRUE
      `,
      [notificationId]
    );

    logger.info({ requestId, notificationId }, 'Email open tracked');
  } catch (err) {
    logger.error({ err, requestId, notificationId }, 'Failed to track email open');
  }

  res.status(200).end(PIXEL);
}); 