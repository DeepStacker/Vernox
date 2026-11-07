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
  serviceability: { scope: 'serviceability', limit: 30, windowMs: 60_000 },
  invoice: { scope: 'invoice', limit: 20, windowMs: 60_000 },
  orderCancel: { scope: 'order_cancel', limit: 10, windowMs: 60_000 },
  returnRequest: { scope: 'return_request', limit: 10, windowMs: 60_000 },
  consultation: { scope: 'consultation', limit: 20, windowMs: 60_000 },
  contact: { scope: 'contact', limit: 5, windowMs: 3600_000 },
  newsletter: { scope: 'newsletter', limit: 10, windowMs: 3600_000 },
  trade: { scope: 'trade', limit: 5, windowMs: 3600_000 },
  review: { scope: 'review', limit: 30, windowMs: 60_000 },
  // COD abuse: per mobile number and per email, independent of IP.
  codCheckoutPhone: { scope: 'cod_phone', limit: 3, windowMs: 3600_000 },
  // COD OTP: sends per mobile number and per IP, code checks per IP (attempts per code are capped in codOtp.ts).
  codOtpPhone: { scope: 'cod_otp_phone', limit: 5, windowMs: 3600_000 },
  codOtpIp: { scope: 'cod_otp_ip', limit: 15, windowMs: 3600_000 },
  codOtpVerifyIp: { scope: 'cod_otp_verify_ip', limit: 30, windowMs: 3600_000 },
  codCheckoutEmail: { scope: 'cod_email', limit: 3, windowMs: 3600_000 },
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
  await enforceRateLimitKey(store, rule, clientIp(req));
}

/** Rate limit on an explicit key (e.g. a phone number) instead of the client IP. */
export async function enforceRateLimitKey(store: DocStore, rule: RateLimitRule, key: string): Promise<void> {
  const allowed = await consumeRateLimit(store, rule, key);
  if (!allowed) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.');
}
