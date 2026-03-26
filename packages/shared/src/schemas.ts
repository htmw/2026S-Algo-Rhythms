import { z } from 'zod';

// Schema for POST /v1/notifications
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

// Schema for POST /v1/tenants/register
export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.enum(['free', 'starter', 'business', 'enterprise']).default('free'),
});

// Types inferred from schemas
export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
