import crypto from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { pool } from '../db.js';
import { logger } from '../logger.js';
import { RegisterTenantSchema } from '../schemas/tenant.js';

export const tenantRouter = Router();

function slugifyCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  const raw = `ne_${env}_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.substring(0, 8);
  return { raw, hash, prefix };
}

tenantRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const requestId = crypto.randomUUID();

  let parsed;
  try {
    parsed = RegisterTenantSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message },
        request_id: requestId,
      });
      return;
    }
    throw err;
  }

  const { company_name } = parsed;
  const slug = slugifyCompanyName(company_name);
  const apiKey = generateApiKey();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const duplicateCheck = await client.query(
      'SELECT id FROM tenants WHERE slug = $1',
      [slug],
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: { code: 'DUPLICATE_TENANT', message: 'A tenant with this company name already exists.' },
        request_id: requestId,
      });
      return;
    }

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, plan, rate_limit_per_sec, monthly_quota, max_channels)
       VALUES ($1, $2, 'free', 10, 10000, 3)
       RETURNING id, name, slug, created_at`,
      [company_name, slug],
    );

    const tenant = tenantResult.rows[0];

    await client.query(
      `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, label, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant.id, apiKey.hash, apiKey.prefix, `${company_name} primary key`, '{notifications:write,notifications:read}'],
    );

    // Create default channels for the new tenant
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenant.id]);

    await client.query(
      `INSERT INTO channels (tenant_id, type, label, config, priority, is_enabled, circuit_state)
       VALUES
         ($1, 'email', 'Email', '{"smtp_host": "localhost", "smtp_port": 1025}', 10, true, 'closed'),
         ($1, 'websocket', 'In-App WebSocket', '{}', 5, true, 'closed'),
         ($1, 'webhook', 'Generic Webhook', '{}', 1, true, 'closed')`,
      [tenant.id],
    );

    await client.query("SELECT set_config('app.current_tenant_id', '', false)");

    await client.query('COMMIT');

    logger.info({ requestId, tenantId: tenant.id, companyName: company_name }, 'Tenant registered');

    res.status(201).json({
      tenant_id: tenant.id,
      company_name: tenant.name,
      slug: tenant.slug,
      api_key: apiKey.raw,
      message: 'Tenant registered successfully. Save this API key now - it will not be shown again.',
      created_at: tenant.created_at,
      request_id: requestId,
    });
  } catch (err: unknown) {
    await client.query('ROLLBACK');

    const pgError = err as { code?: string };
    if (pgError.code === '23505') {
      res.status(409).json({
        error: { code: 'DUPLICATE_TENANT', message: 'A tenant with this company name already exists.' },
        request_id: requestId,
      });
      return;
    }

    logger.error({ err, requestId, companyName: company_name }, 'Tenant registration failed');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      request_id: requestId,
    });
  } finally {
    client.release();
  }
});
