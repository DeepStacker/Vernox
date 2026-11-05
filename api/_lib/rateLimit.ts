/**
 * Firestore-backed fixed-window rate limiter.
 *
 * In-memory counters do not work on serverless (each instance has its own
 * memory and instances are recycled), so counters live in
 * `rate_limits/{scope}_{sha256(key)}_{window}` and are incremented in a
 * transaction. Keys are hashed so raw IPs are not stored. Configure a Firestore
 * TTL policy on `rate_limits.expiresAt` to purge old windows (see DATABASE.md).
 */
import crypto from 'crypto';
import type { VercelRequest } from '@vercel/node';
import { ApiError } from './errors';
import { clientIp } from './http';
import type { DocStore } from './store';

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  checkoutIntent: { scope: 'checkout', limit: 20, windowMs: 60_000 },
  validateCoupon: { scope: 'coupon', limit: 30, windowMs: 60_000 },
  orderStatus: { scope: 'order_status', limit: 20, windowMs: 60_000 },
  admin: { scope: 'admin', limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** Returns true when the request is within the limit (and counts it). */
export async function consumeRateLimit(store: DocStore, rule: RateLimitRule, key: string, now = Date.now()): Promise<boolean> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const hashed = crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  const path = `rate_limits/${rule.scope}_${hashed}_${windowStart}`;
  return store.runTransaction(async tx => {
    const current = await tx.get(path);
    const count = typeof current?.count === 'number' ? current.count : 0;
    if (count >= rule.limit) return false;
    tx.set(path, { count: count + 1, scope: rule.scope, windowStart, expiresAt: new Date(windowStart + rule.windowMs * 2) });
    return true;
  });
}

export async function enforceRateLimit(store: DocStore, req: VercelRequest, rule: RateLimitRule): Promise<void> {
  const allowed = await consumeRateLimit(store, rule, clientIp(req));
  if (!allowed) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute and try again.');
}
