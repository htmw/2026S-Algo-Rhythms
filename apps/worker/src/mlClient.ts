import type { FeatureVector } from './features.js';
import { logger } from './logger.js';

export interface MLPredictionRequest {
  recipient: string;
  available_channels: string[];
  features_per_channel: Record<string, FeatureVector>;
  exploration_rate: number;
}

export interface MLPredictionResponse {
  selected: string;
  predictions: Record<string, number>;
  exploration: boolean;
  reason: string;
  model_version: string;
}

const DEFAULT_TIMEOUT_MS = 2000;

export interface PredictChannelOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Calls the ML service /predict endpoint.
 *
 * Returns null on any failure (network error, timeout, non-2xx, malformed JSON)
 * so callers can fall back to static routing without surfacing errors.
 */
export async function predictChannel(
  request: MLPredictionRequest,
  options: PredictChannelOptions = {},
): Promise<MLPredictionResponse | null> {
  const baseUrl = options.baseUrl ?? process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'ML service returned non-2xx; falling back to static');
      return null;
    }

    const body = (await res.json()) as MLPredictionResponse;
    if (!body || typeof body.selected !== 'string') {
      logger.warn('ML service returned malformed response; falling back to static');
      return null;
    }
    return body;
  } catch (err) {
    logger.warn({ err }, 'ML service request failed; falling back to static');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
