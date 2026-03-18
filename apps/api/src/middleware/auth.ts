import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import { logger } from '../logger.js';

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  scopes: string[];
}

function sendError(res: Response, statusCode: number, code: string, message: string, requestId: string): void {
  res.status(statusCode).json({
    error: { code, message },
    request_id: requestId,
  });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'MISSING_API_KEY', 'Authorization header is required.', requestId);
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    sendError(res, 401, 'MISSING_API_KEY', 'Authorization header is required.', requestId);
    return;
  }

  const computedHash = crypto.createHash('sha256').update(token).digest('hex');

  let row: ApiKeyRow | undefined;
  try {
    const result = await pool.query<ApiKeyRow>(
      `SELECT id, tenant_id, key_hash, scopes
       FROM api_keys
       WHERE key_hash = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [computedHash],
    );
    row = result.rows[0];
  } catch (err) {
    logger.error({ err, requestId }, 'Database error during API key lookup');
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.', requestId);
    return;
  }

  if (!row) {
    logger.warn({ requestId, keyPrefix: token.substring(0, 12) + '...' }, 'Invalid API key attempt');
    sendError(res, 401, 'INVALID_API_KEY', 'API key is invalid, expired, or revoked.', requestId);
    return;
  }

  // Constant-time verification (defense-in-depth)
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(row.key_hash, 'hex');
  if (!crypto.timingSafeEqual(computedBuffer, storedBuffer)) {
    logger.warn({ requestId }, 'API key hash mismatch in constant-time check');
    sendError(res, 401, 'INVALID_API_KEY', 'API key is invalid, expired, or revoked.', requestId);
    return;
  }

  // Acquire dedicated client and set tenant context for RLS
  let client;
  try {
    client = await pool.connect();
    await client.query('SET app.current_tenant_id = $1', [row.tenant_id]);
  } catch (err) {
    client?.release();
    logger.error({ err, requestId, tenantId: row.tenant_id }, 'Failed to set tenant context');
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.', requestId);
    return;
  }

  req.tenantId = row.tenant_id;
  req.apiKeyId = row.id;
  req.scopes = row.scopes;
  req.dbClient = client;

  // Release client when response finishes
  let released = false;
  const releaseClient = (): void => {
    if (released) return;
    released = true;
    client.query('RESET app.current_tenant_id')
      .catch((err: unknown) => {
        logger.error({ err, requestId }, 'Failed to reset tenant context');
      })
      .finally(() => {
        client.release();
      });
  };

  res.on('finish', releaseClient);
  res.on('close', releaseClient);

  // Fire-and-forget: update last_used_at
  pool.query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [row.id],
  ).catch((err: unknown) => {
    logger.error({ err, requestId, apiKeyId: row.id }, 'Failed to update last_used_at');
  });

  logger.info({ requestId, tenantId: row.tenant_id, keyPrefix: token.substring(0, 12) + '...' }, 'Request authenticated');

  next();
}
