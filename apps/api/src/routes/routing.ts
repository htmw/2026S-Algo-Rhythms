import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger.js';

export const routingRouter = Router();

const DEFAULT_TIMEOUT_MS = 2000;

routingRouter.get('/model', async (req: Request, res: Response): Promise<void> => {
  const { requestId } = req;
  const baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const mlRes = await fetch(`${baseUrl}/model/info`, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });

    if (!mlRes.ok) {
      logger.warn({ requestId, status: mlRes.status }, 'ML service /model/info returned non-2xx');
      res.status(503).json({
        error: { code: 'ML_SERVICE_UNAVAILABLE', message: 'ML service is not reachable' },
        request_id: requestId,
      });
      return;
    }

    const body = await mlRes.json();
    res.status(200).json({ ...body, request_id: requestId });
  } catch (err) {
    logger.warn({ err, requestId }, 'ML service /model/info request failed');
    res.status(503).json({
      error: { code: 'ML_SERVICE_UNAVAILABLE', message: 'ML service is not reachable' },
      request_id: requestId,
    });
  } finally {
    clearTimeout(timer);
  }
});

// GET /v1/routing/recipients
routingRouter.get('/recipients', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;
  try {
    const result = await dbClient.query(
      `SELECT
         recipient,
         SUM(attempts_30d)::int AS total_sent,
         SUM(engagements_30d)::int AS total_engaged,
         COUNT(DISTINCT channel_type) AS channels_used,
         MAX(last_engaged_at) AS last_engaged_at
       FROM recipient_channel_stats
       WHERE tenant_id = $1
       GROUP BY recipient
       ORDER BY total_sent DESC
       LIMIT 50`,
      [tenantId],
    );
    res.status(200).json({ data: result.rows, request_id: requestId });
  } catch (err) {
    logger.error({ err, requestId }, 'Failed to fetch recipients');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }, request_id: requestId });
  }
});

// GET /v1/routing/recipients/:recipient/engagement
routingRouter.get('/recipients/:recipient/engagement', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;
  const { recipient } = req.params;
  try {
    const result = await dbClient.query(
      `SELECT
         channel_type AS channel,
         attempts_30d AS sent,
         engagements_30d AS engaged,
         successes_30d AS delivered
       FROM recipient_channel_stats
       WHERE tenant_id = $1 AND recipient = $2
       ORDER BY attempts_30d DESC`,
      [tenantId, recipient],
    );
    res.status(200).json({ data: result.rows, request_id: requestId });
  } catch (err) {
    logger.error({ err, requestId }, 'Failed to fetch recipient engagement');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }, request_id: requestId });
  }
});

// GET /v1/routing/engagement-comparison
routingRouter.get('/engagement-comparison', async (req: Request, res: Response): Promise<void> => {
  const { requestId, tenantId, dbClient } = req;
  try {
    const result = await dbClient.query(
      `SELECT
         DATE_TRUNC('day', n.created_at) AS date,
         n.routing_mode,
         COUNT(*)::int AS total,
         COUNT(da.engaged) FILTER (WHERE da.engaged = true)::int AS engaged
       FROM notifications n
       LEFT JOIN delivery_attempts da ON da.notification_id = n.id AND da.tenant_id = n.tenant_id
       WHERE n.tenant_id = $1
         AND n.created_at >= NOW() - INTERVAL '30 days'
         AND n.routing_mode IN ('static', 'adaptive')
       GROUP BY DATE_TRUNC('day', n.created_at), n.routing_mode
       ORDER BY date ASC`,
      [tenantId],
    );
    res.status(200).json({ data: result.rows, request_id: requestId });
  } catch (err) {
    logger.error({ err, requestId }, 'Failed to fetch engagement comparison');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }, request_id: requestId });
  }
});