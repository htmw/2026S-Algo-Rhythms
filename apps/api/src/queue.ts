import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@notifyengine/shared';
import type { NotificationPriority } from '@notifyengine/shared';

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

const queueMap = new Map<string, Queue>();

const PRIORITY_QUEUE_MAP: Record<NotificationPriority, string> = {
  critical: QUEUE_NAMES.CRITICAL,
  high: QUEUE_NAMES.HIGH,
  standard: QUEUE_NAMES.STANDARD,
  bulk: QUEUE_NAMES.BULK,
};

export function getNotificationQueue(priority: NotificationPriority): Queue {
  const queueName = PRIORITY_QUEUE_MAP[priority];
  let queue = queueMap.get(queueName);
  if (!queue) {
    queue = new Queue(queueName, { connection });
    queueMap.set(queueName, queue);
  }
  return queue;
}
