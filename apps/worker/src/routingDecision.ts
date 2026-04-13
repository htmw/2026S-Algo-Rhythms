import type { RoutingMode } from '@notifyengine/shared';
import type { MLPredictionResponse } from './mlClient.js';

/**
 * Persisted shape for `notifications.routing_decision` JSONB column.
 * Fields beyond `mode`/`selected`/`reason` are only populated for adaptive
 * routing where the ML service produced a prediction.
 */
export interface RoutingDecisionRecord {
  mode: RoutingMode;
  selected: string;
  reason: string;
  predictions?: Record<string, number>;
  exploration?: boolean;
  model_version?: string | null;
}

export function buildAdaptiveDecision(ml: MLPredictionResponse): RoutingDecisionRecord {
  return {
    mode: 'adaptive',
    selected: ml.selected,
    reason: ml.reason,
    predictions: ml.predictions,
    exploration: ml.exploration,
    model_version: ml.model_version,
  };
}

export function buildStaticDecision(selected: string): RoutingDecisionRecord {
  return {
    mode: 'static',
    selected,
    reason: 'Static priority order',
  };
}

export function buildForcedDecision(selected: string): RoutingDecisionRecord {
  return {
    mode: 'forced',
    selected,
    reason: 'Forced channel',
  };
}

export function buildAdaptiveFallbackDecision(selected: string, reason: string): RoutingDecisionRecord {
  return {
    mode: 'adaptive',
    selected,
    reason,
    model_version: null,
  };
}
