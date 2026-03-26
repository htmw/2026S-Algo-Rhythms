import { z } from 'zod';

export const RegisterTenantSchema = z.object({
  company_name: z.string().min(1).max(255),
});

export type RegisterTenantInput = z.infer<typeof RegisterTenantSchema>;