import { z } from 'zod';

export { SendNotificationSchema } from '@notifyengine/shared';
export type { SendNotificationInput } from '@notifyengine/shared';

// ── List Notifications ──
export const NOTIFICATION_STATUSES = [
  'pending',
  'queued',
  'processing',
  'delivered',
  'failed',
  'dlq',
] as const;

export const ListNotificationsQuerySchema = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  cursor: z
    .string()
    .datetime({ message: 'cursor must be a valid ISO 8601 datetime' })
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;
