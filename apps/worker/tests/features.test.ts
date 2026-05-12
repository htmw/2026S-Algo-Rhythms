import { describe, it, expect } from 'vitest';
import { extractFeatures, type RecipientChannelStatsRow, type ContentClassification } from '../src/features.js';

const NOW = new Date('2026-04-08T14:00:00Z'); // Wednesday 14:00 UTC

const fullStats: RecipientChannelStatsRow = {
  channel_type: 'email',
  attempts_30d: 50,
  successes_30d: 40,
  engagements_30d: 20,
  avg_latency_ms: 320,
  last_success_at: new Date('2026-04-07T14:00:00Z'),
  last_engaged_at: new Date('2026-04-06T14:00:00Z'),
  notifications_received_24h: 3,
  notifications_received_7d: 12,
};

describe('extractFeatures', () => {
  it('produces full feature vector when stats are present', () => {
    const f = extractFeatures({
      channelType: 'email',
      priority: 'high',
      bodyLength: 250,
      circuitState: 'closed',
      stats: fullStats,
      now: NOW,
    });

    expect(f.channel_type).toBe('email');
    expect(f.hour_of_day).toBe(14);
    expect(f.day_of_week).toBe(2); // Wed = 2 (Mon=0)
    expect(f.is_weekend).toBe(0);
    expect(f.historical_success_rate).toBeCloseTo(0.8);
    expect(f.historical_engagement_rate).toBeCloseTo(0.5);
    expect(f.hours_since_last_success).toBeCloseTo(24);
    expect(f.hours_since_last_engagement).toBeCloseTo(48);
    expect(f.avg_latency_ms).toBe(320);
    expect(f.attempts_30d).toBe(50);
    expect(f.notifications_sent_24h).toBe(3);
    expect(f.notifications_sent_7d).toBe(12);
    expect(f.notification_priority_score).toBe(3);
    expect(f.content_length).toBe(250);
    expect(f.channel_health).toBe(1);
  });

  it('uses safe defaults for a brand-new recipient with no stats', () => {
    const f = extractFeatures({
      channelType: 'websocket',
      priority: 'standard',
      bodyLength: 0,
      circuitState: 'closed',
      stats: null,
      now: NOW,
    });

    expect(f.historical_success_rate).toBe(0);
    expect(f.historical_engagement_rate).toBe(0);
    expect(f.hours_since_last_success).toBe(720);
    expect(f.hours_since_last_engagement).toBe(720);
    expect(f.avg_latency_ms).toBe(1000);
    expect(f.attempts_30d).toBe(0);
    expect(f.notifications_sent_24h).toBe(0);
    expect(f.notification_priority_score).toBe(2);
    expect(f.channel_health).toBe(1);
  });

  it('flags is_weekend on Saturday/Sunday', () => {
    const sat = new Date('2026-04-11T10:00:00Z');
    const f = extractFeatures({
      channelType: 'email',
      priority: 'bulk',
      bodyLength: 10,
      circuitState: 'closed',
      stats: null,
      now: sat,
    });
    expect(f.day_of_week).toBe(5);
    expect(f.is_weekend).toBe(1);
  });

  it('reports zero channel_health when circuit is open', () => {
    const f = extractFeatures({
      channelType: 'email',
      priority: 'critical',
      bodyLength: 100,
      circuitState: 'open',
      stats: null,
      now: NOW,
    });
    expect(f.channel_health).toBe(0);
    expect(f.notification_priority_score).toBe(4);
  });

  it('produces exactly 19 keys when content_classification is present', () => {
    const classification: ContentClassification = {
      urgency_score: 0.8,
      category: 'security',
      category_encoded: 0,
      time_sensitivity_score: 0.9,
      sentiment_score: 0.3,
      optimal_channel_hint: 'sms_webhook',
      reasoning: 'Security alert',
    };

    const f = extractFeatures({
      channelType: 'email',
      priority: 'high',
      bodyLength: 200,
      circuitState: 'closed',
      stats: fullStats,
      contentClassification: classification,
      now: NOW,
    });

    expect(Object.keys(f).length).toBe(19);
    expect(f.urgency_score).toBe(0.8);
    expect(f.category_encoded).toBe(0);
    expect(f.time_sensitivity_score).toBe(0.9);
    expect(f.sentiment_score).toBe(0.3);
  });

  it('produces exactly 19 keys when content_classification is null', () => {
    const f = extractFeatures({
      channelType: 'email',
      priority: 'standard',
      bodyLength: 100,
      circuitState: 'closed',
      stats: null,
      contentClassification: null,
      now: NOW,
    });

    expect(Object.keys(f).length).toBe(19);
    expect(f.urgency_score).toBe(0);
    expect(f.category_encoded).toBe(0);
    expect(f.time_sensitivity_score).toBe(0);
    expect(f.sentiment_score).toBe(0);
  });

  it('feature key names match ML service FEATURE_COLUMNS', () => {
    const ML_FEATURE_COLUMNS = [
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

    const f = extractFeatures({
      channelType: 'email',
      priority: 'standard',
      bodyLength: 100,
      circuitState: 'closed',
      stats: null,
      now: NOW,
    });

    const workerKeys = new Set(Object.keys(f));
    // Worker sends channel_type (string), ML encodes it to channel_type_encoded
    workerKeys.delete('channel_type');
    workerKeys.add('channel_type_encoded');

    const mlKeys = new Set(ML_FEATURE_COLUMNS);
    expect(workerKeys).toEqual(mlKeys);
  });
});
