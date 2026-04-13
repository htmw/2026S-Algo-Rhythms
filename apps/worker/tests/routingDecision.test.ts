import { describe, it, expect } from 'vitest';
import {
  buildAdaptiveDecision,
  buildAdaptiveFallbackDecision,
  buildForcedDecision,
  buildStaticDecision,
} from '../src/routingDecision.js';

describe('routing decision builders', () => {
  it('buildStaticDecision', () => {
    expect(buildStaticDecision('email')).toEqual({
      mode: 'static',
      selected: 'email',
      reason: 'Static priority order',
    });
  });

  it('buildForcedDecision', () => {
    expect(buildForcedDecision('webhook')).toEqual({
      mode: 'forced',
      selected: 'webhook',
      reason: 'Forced channel',
    });
  });

  it('buildAdaptiveDecision carries ML metadata through', () => {
    const decision = buildAdaptiveDecision({
      selected: 'websocket',
      predictions: { email: 0.4, websocket: 0.9 },
      exploration: false,
      reason: 'XGBoost picked websocket',
      model_version: 'v12',
    });
    expect(decision).toEqual({
      mode: 'adaptive',
      selected: 'websocket',
      reason: 'XGBoost picked websocket',
      predictions: { email: 0.4, websocket: 0.9 },
      exploration: false,
      model_version: 'v12',
    });
  });

  it('buildAdaptiveFallbackDecision marks model_version as null', () => {
    const decision = buildAdaptiveFallbackDecision('email', 'ML service unreachable');
    expect(decision.mode).toBe('adaptive');
    expect(decision.selected).toBe('email');
    expect(decision.model_version).toBeNull();
  });
});
