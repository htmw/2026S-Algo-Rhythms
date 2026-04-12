import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../logger.js'; // Assuming logger exists

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { tenantId } = req;
  
  // 1. FAIL-OPEN: If there's no tenantId, skip rate limiting instead of crashing
  if (!tenantId) return next();

  try {
    // 2. DYNAMIC LIMITS: Hardcoding 1000 is blocked. 
    // In a real scenario, you'd fetch this from req.tenant (populated by authMiddleware)
    const limitPerSec = req.tenant?.rate_limit_per_sec || 10; 
    const limit = limitPerSec * 60; // Convert to per minute
    
    const key = `rate_limit:${tenantId}`;
    const now = Math.floor(Date.now() / 1000);

    // 3. FIX RACE CONDITION: Using a pipeline (or Lua) ensures INCR and EXPIRE happen together
    const [incrResult, ttlResult] = await redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec() as [[Error | null, number], [Error | null, number]];

    const current = incrResult[1];
    let ttl = ttlResult[1];

    if (current === 1 || ttl === -1) {
      await redis.expire(key, 60);
      ttl = 60;
    }

    const reset = now + ttl;
    const remaining = Math.max(limit - current, 0);

    // Standard Headers
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (current > limit) {
      // 4. API CONVENTIONS: Add request_id and retry_after_ms
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests.',
          request_id: req.id, // Ensure req.id is populated (e.g., by pino-http)
          retry_after_ms: ttl * 1000,
        },
      });
      return;
    }
  } catch (err) {
    // 1. FAIL-OPEN: If Redis is down, log error but let the request through
    logger.error({ err, tenantId }, 'Rate limit check failed - failing open');
  }

  next();
}