import { z } from 'zod';

export const SendNotificationSchema = z.object({
  recipient: z.string().min(1).max(255),
  subject: z.string().max(500).optional(),
  body: z.string().min(1),
  body_html: z.string().optional(),
  priority: z.enum(['critical', 'high', 'standard', 'bulk']).default('standard'),
  routing_mode: z.enum(['adaptive', 'static', 'forced']).default('adaptive'),
  channel_preference: z.array(z.string()).optional(),
  force_channel: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;

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

  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;