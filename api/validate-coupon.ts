/**
 * POST /api/validate-coupon
 * Public-facing serverless endpoint for real-time coupon verification.
 * Recalculates discounts authoritatively without trusting client numbers.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateAndCalculateCoupon } from './couponEngine';

// In-memory rate limiting map (IP -> timestamp[])
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enforce proper HTTP method
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate Limiting Protection against coupon brute-force attacks
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ 
      error: 'Too many coupon validation attempts. Please try again in a minute.',
      errorCode: 'RATE_LIMIT_EXCEEDED' 
    });
  }

  const { code, cartSubtotal, cartItems, customerEmail, currency, clientCoupons } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ 
      error: 'Coupon code is required',
      errorCode: 'INVALID_CODE' 
    });
  }

  try {
    const result = await validateAndCalculateCoupon({
      code: code.trim(),
      cartSubtotal: Number(cartSubtotal) || 0,
      cartItems: Array.isArray(cartItems) ? cartItems : undefined,
      customerEmail: customerEmail && typeof customerEmail === 'string' ? customerEmail.trim() : undefined,
      currency: currency && typeof currency === 'string' ? currency : 'INR',
      clientCoupons: Array.isArray(clientCoupons) ? clientCoupons : undefined,
    });

    if (!result.isValid) {
      return res.status(200).json(result);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Coupon validation handler error:', err);
    return res.status(500).json({ 
      isValid: false,
      error: 'An internal error occurred while validating the coupon. Please try again.',
      errorCode: 'SERVER_ERROR' 
    });
  }
}
