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
