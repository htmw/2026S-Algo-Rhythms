import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';

const DEFAULT_RATE_LIMIT = 1000;
const WINDOW_SECONDS = 60;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

function sendRateLimitExceeded(res: Response, limit: number, remaining: number, reset: number): void {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  });
}

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tenantId = req.tenantId;

  if (!tenantId) {
    next();
    return;
  }

  const limit = DEFAULT_RATE_LIMIT;
  const key = `rate_limit:${tenantId}`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const reset = nowSeconds + Math.max(ttl, 0);
  const remaining = Math.max(limit - current, 0);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));

  if (current > limit) {
    sendRateLimitExceeded(res, limit, 0, reset);
    return;
  }

  next();
}
