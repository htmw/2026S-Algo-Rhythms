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
