import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../logger.js';

// 1. Extend the Request type to match auth.ts and our needs
interface AuthenticatedRequest extends Request {
  requestId: string;
  tenantId: string;
  // This allows us to access the rate limit per second from the database
  tenant?: {
    rate_limit_per_sec?: number;
  };
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export async function rateLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { tenantId, requestId } = req;

  // FAIL-OPEN: If auth failed to provide a tenantId, don't block the request here
  if (!tenantId) {
    return next();
  }

  try {
    // 2. DYNAMIC LIMITS: Read from tenant record or fallback to 16/sec (approx 1000/min)
    const limitPerSec = req.tenant?.rate_limit_per_sec || 16;
    const limit = limitPerSec * 60;
    
    const key = `rate_limit:${tenantId}`;
    const now = Math.floor(Date.now() / 1000);

    // 3. FIX RACE CONDITION: Using multi() ensures atomic operations
    const result = await redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec();

    if (!result) throw new Error('Redis multi command failed');

    // ioredis multi results are [[error, value], [error, value]]
    const current = result[0][1] as number;
    let ttl = result[1][1] as number;

    // If it's a new key or the TTL was lost, set/reset expiration
    if (current === 1 || ttl === -1) {
      await redis.expire(key, 60);
      ttl = 60;
    }

    const reset = now + ttl;
    const remaining = Math.max(limit - current, 0);

    // 4. API CONVENTION: Set standard headers
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (current > limit) {
      // 5. API CONVENTION: 429 response with metadata
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests.',
        },
        request_id: requestId, // Matches the variable name in auth.ts
        retry_after_ms: ttl * 1000,
      });
      return;
    }
  } catch (err) {
    // FAIL-OPEN: Log the error but let the traffic flow
    logger.error({ err, tenantId, requestId }, 'Rate limit check failed - failing open');
  }

  next();
}