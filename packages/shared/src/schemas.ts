import { z } from 'zod';

// Schema for POST /v1/notifications
export const SendNotificationSchema = z.object({
  recipient: z.string().min(1, "Recipient is required"),
  message: z.string().min(1, "Message content is required"),
  priority: z.enum(['critical', 'high', 'standard', 'bulk']).default('standard'),
  routingMode: z.enum(['adaptive', 'static', 'forced']).default('adaptive'),
  channelPreference: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// Schema for POST /v1/tenants/register
export const CreateTenantSchema = z.object({
  name: z.string().min(2, "Tenant name must be at least 2 characters"),
  email: z.string().email("Invalid admin email address"),
  webhookUrl: z.string().url("Invalid webhook URL format").optional(),
});

// Types inferred from schemas for use in TypeScript
export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
