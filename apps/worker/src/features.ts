import type { NotificationPriority } from '@notifyengine/shared';

export interface RecipientChannelStatsRow {
  channel_type: string;
  attempts_30d: number;
  successes_30d: number;
  engagements_30d: number;
  avg_latency_ms: number | null;
  last_success_at: Date | null;
  last_engaged_at: Date | null;
  notifications_received_24h: number;
  notifications_received_7d: number;
}

export interface FeatureVector {
  channel_type: string;
  hour_of_day: number;
  day_of_week: number;
  is_weekend: number;
  historical_success_rate: number;
  historical_engagement_rate: number;
  hours_since_last_engagement: number;
  hours_since_last_success: number;
  avg_latency_ms: number;
  attempts_30d: number;
  notifications_sent_24h: number;
  notifications_sent_7d: number;
  notification_priority_score: number;
  content_length: number;
  channel_health: number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

const PRIORITY_SCORE: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  bulk: 1,
};

// 30 days in hours — used as the default when a recipient has no recorded
// engagement/success history yet, matching the Python reference in tech-spec 5.3.
const DEFAULT_HOURS_SINCE = 720;
const DEFAULT_AVG_LATENCY_MS = 1000;

export interface ExtractFeaturesArgs {
  channelType: string;
  priority: NotificationPriority;
  bodyLength: number;
  circuitState: CircuitState;
  stats: RecipientChannelStatsRow | null;
  now?: Date;
}

export function extractFeatures(args: ExtractFeaturesArgs): FeatureVector {
  const now = args.now ?? new Date();
  const stats = args.stats;

  const attempts = stats?.attempts_30d ?? 0;
  const successes = stats?.successes_30d ?? 0;
  const engagements = stats?.engagements_30d ?? 0;

  const hoursSince = (date: Date | null | undefined): number => {
    if (!date) return DEFAULT_HOURS_SINCE;
    return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  };

  // JS getDay: 0=Sun..6=Sat. Spec uses 0=Mon..6=Sun.
  const sundayBased = now.getUTCDay();
  const dayOfWeek = (sundayBased + 6) % 7;

  return {
    channel_type: args.channelType,
    hour_of_day: now.getUTCHours(),
    day_of_week: dayOfWeek,
    is_weekend: dayOfWeek >= 5 ? 1 : 0,
    historical_success_rate: successes / Math.max(attempts, 1),
    historical_engagement_rate: engagements / Math.max(successes, 1),
    hours_since_last_engagement: hoursSince(stats?.last_engaged_at ?? null),
    hours_since_last_success: hoursSince(stats?.last_success_at ?? null),
    avg_latency_ms: stats?.avg_latency_ms ?? DEFAULT_AVG_LATENCY_MS,
    attempts_30d: attempts,
    notifications_sent_24h: stats?.notifications_received_24h ?? 0,
    notifications_sent_7d: stats?.notifications_received_7d ?? 0,
    notification_priority_score: PRIORITY_SCORE[args.priority],
    content_length: args.bodyLength,
    channel_health: args.circuitState === 'closed' ? 1.0 : 0.0,
  };
}
