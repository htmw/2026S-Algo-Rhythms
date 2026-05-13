import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger.js';

const MODEL_INFO_TIMEOUT_MS = 10_000;

const FALLBACK_FEATURE_NAMES: string[] = [
  'channel_type_encoded',
  'hour_of_day',
  'day_of_week',
  'is_weekend',
  'historical_success_rate',
  'historical_engagement_rate',
  'hours_since_last_engagement',
  'hours_since_last_success',
  'avg_latency_ms',
  'attempts_30d',
  'notifications_sent_24h',
  'notifications_sent_7d',
  'notification_priority_score',
  'content_length',
  'channel_health',
  'urgency_score',
  'category_encoded',
  'time_sensitivity_score',
  'sentiment_score',
];

export const modelRouter = Router();

modelRouter.get('/info', async (req: Request, res: Response): Promise<void> => {
  const { requestId } = req;
  const baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_INFO_TIMEOUT_MS);

  try {
    const mlRes = await fetch(`${baseUrl}/model/info`, {
      signal: controller.signal,
    });

    if (!mlRes.ok) {
      logger.warn({ requestId, status: mlRes.status }, 'ML service /model/info returned non-2xx');
      res.status(200).json({
        loaded: false,
        version: null,
        message: 'ML service unavailable',
        request_id: requestId,
      });
      return;
    }

    const body = await mlRes.json() as Record<string, unknown>;
    res.status(200).json({ ...body, request_id: requestId });
  } catch (err) {
    logger.warn({ err, requestId }, 'ML service /model/info request failed');
    res.status(200).json({
      loaded: false,
      version: null,
      message: 'ML service unavailable',
      request_id: requestId,
    });
  } finally {
    clearTimeout(timer);
  }
});

modelRouter.get('/features', async (req: Request, res: Response): Promise<void> => {
  const { requestId } = req;
  const baseUrl = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_INFO_TIMEOUT_MS);

  try {
    const mlRes = await fetch(`${baseUrl}/model/info`, {
      signal: controller.signal,
    });

    if (!mlRes.ok) {
      logger.warn({ requestId, status: mlRes.status }, 'ML service /model/info returned non-2xx (features)');
      res.status(200).json({
        feature_importance: {},
        feature_names: FALLBACK_FEATURE_NAMES,
        request_id: requestId,
      });
      return;
    }

    const body = await mlRes.json() as Record<string, unknown>;
    const featureImportance = (body.feature_importance ?? {}) as Record<string, number>;
    const featureNames = Object.keys(featureImportance).length > 0
      ? Object.keys(featureImportance)
      : FALLBACK_FEATURE_NAMES;

    res.status(200).json({
      feature_importance: featureImportance,
      feature_names: featureNames,
      request_id: requestId,
    });
  } catch (err) {
    logger.warn({ err, requestId }, 'ML service /model/info request failed (features)');
    res.status(200).json({
      feature_importance: {},
      feature_names: [],
      request_id: requestId,
    });
  } finally {
    clearTimeout(timer);
  }
});
