import type { RequestHandler } from 'express';

const MAX_BUCKETS = 1000;
interface Bucket { attempts: number; expiresAt: number; }

export type RateLimiter = RequestHandler & { resetForTests(): void };

/** Fixed-window limits use the socket IP, never a caller-supplied forwarding header. */
export function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError('Rate limiter bounds must be positive integers');
  }
  const buckets = new Map<string, Bucket>();
  const handler: RequestHandler = (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.expiresAt <= now) buckets.delete(key);
    const key = req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      bucket = { attempts: 0, expiresAt: now + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.attempts >= maxAttempts) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))));
      res.status(429).json({ message: 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
      return;
    }
    bucket.attempts++;
    next();
  };
  return Object.assign(handler, { resetForTests: () => { buckets.clear(); } });
}
