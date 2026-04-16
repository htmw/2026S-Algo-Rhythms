import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../logger.js';
import { pool } from '../db.js'; // Added pool import

// Define the interface for the request object
interface AuthenticatedRequest extends Request {
  requestId: string;
  tenantId: string;
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
});

// Pino Structured Logging for Redis Errors
redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error in Rate Limiter');
});

// LUA Script: Atomic INCR + EXPIRE + TTL
const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return {current, redis.call('TTL', KEYS[1])}
`;

export async function rateLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { tenantId, requestId } = req;

  if (!tenantId) return next();

  try {
    // 1. DYNAMIC LIMITS: Query the database (Fixes the "req.tenant doesn't exist" issue)
    const tenantQuery = await pool.query(
      'SELECT rate_limit_per_sec FROM tenants WHERE id = $1',
      [tenantId]
    );
    
    const limitPerSec = tenantQuery.rows[0]?.rate_limit_per_sec || 16;
    const limit = limitPerSec * 60; // 1-minute window
    
    const key = `rate_limit:${tenantId}`;
    
    // 2. ATOMIC EXECUTION: Run Lua script
    const [current, ttl] = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      60
    )) as [number, number];

    const reset = Math.floor(Date.now() / 1000) + ttl;
    const remaining = Math.max(limit - current, 0);

    // Standard Headers
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (current > limit) {
      // 3. API CONVENTIONS: 429 + Retry-After + Structured Logs
      logger.warn({ tenantId, requestId, limit }, 'Rate limit exceeded');
      
      res.setHeader('Retry-After', String(ttl));
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests.',
        },
        request_id: requestId,
        retry_after_ms: ttl * 1000,
      });
      return;
    }
  } catch (err) {
    // 4. FAIL-OPEN: If Redis or DB is down, let traffic through
    logger.error({ err, tenantId, requestId }, 'Rate limit check failed - failing open');
    return next();
  }

  next();
}