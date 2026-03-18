export const QUEUE_NAMES = {
  CRITICAL: 'notifications:critical',
  HIGH: 'notifications:high',
  STANDARD: 'notifications:standard',
  BULK: 'notifications:bulk',
  DLQ: 'notifications:dlq',
  ML_RETRAIN: 'ml:retrain',
  STATS_ROLLUP: 'stats:rollup',
} as const;

export const QUEUE_CONCURRENCY = {
  [QUEUE_NAMES.CRITICAL]: 20,
  [QUEUE_NAMES.HIGH]: 10,
  [QUEUE_NAMES.STANDARD]: 5,
  [QUEUE_NAMES.BULK]: 2,
} as const;

export const RETRY_CONFIG = {
  critical: { attempts: 5, backoff: { type: 'exponential' as const, delay: 1000 } },
  high: { attempts: 4, backoff: { type: 'exponential' as const, delay: 2000 } },
  standard: { attempts: 3, backoff: { type: 'exponential' as const, delay: 5000 } },
  bulk: { attempts: 2, backoff: { type: 'exponential' as const, delay: 30000 } },
} as const;

export const PRIORITY_SCORE: Record<string, number> = {
  critical: 4,
  high: 3,
  standard: 2,
  bulk: 1,
} as const;
