import { describe, it, expect } from 'vitest';
import { extractFeatures, type RecipientChannelStatsRow } from '../src/features.js';

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
});
